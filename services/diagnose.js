import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
import GlobalApproval from "../models/GlobalApproval.js";
import { sutabandhanConnection } from "../dbConnections.js";

function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function verifySignature(publicKeyPem, payloadStr, signatureBase64) {
  try {
    const v = crypto.createVerify("sha256");
    v.update(payloadStr);
    v.end();
    return v.verify(
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
      signatureBase64,
      "base64"
    );
  } catch { return false; }
}

async function main() {
  await new Promise((res) => {
    if (sutabandhanConnection.readyState === 1) return res();
    sutabandhanConnection.once("connected", res);
  });

  const rec = await GlobalApproval.findOne().sort({ _id: 1 }).lean();

  const createdAtStr = rec.createdAt instanceof Date
    ? rec.createdAt.toISOString()
    : String(rec.createdAt);

  console.log("Target globalHash   :", rec.hash);
  console.log("");

  let found = false;

  function tryHash(label, str) {
    const h = sha256Hex(str);
    if (h === rec.hash) {
      console.log(`\n🎯🎯🎯 MATCH FOUND: [${label}]`);
      console.log("FULL INPUT:\n", str);
      found = true;
      return true;
    }
    return false;
  }

  // ── Build every payload variant ───────────────────────────────────────────
  const payloadObj    = rec.payload;                          // object from DB
  const payloadStr    = JSON.stringify(rec.payload);          // JSON string
  const payloadCanon  = canonicalize(rec.payload);            // canonical string

  // ── Base globalPayload (what the old code built) ──────────────────────────
  // Old code: globalPayload = { eventType, payload: payloadData, signer,
  //   signerPublicKey, signature, adminHash, adminSeq, createdAt: nowISO }
  // auditDoc = { ...globalPayload, previousHash, hash }
  // systemSignature added AFTER signing

  // Variants of what payload inside globalPayload could be
  const payloadVariants = {
    "obj":    payloadObj,
    "str":    payloadStr,
    "canon":  payloadCanon,
  };

  // All field combinations for the hashed object
  const baseFields = {
    eventType:       rec.eventType,
    signer:          rec.signer,
    signerPublicKey: rec.signerPublicKey,
    signature:       rec.signature,
    adminHash:       rec.adminHash,
    adminSeq:        rec.adminSeq,
    createdAt:       createdAtStr,
  };

  const prevVariants   = ["GENESIS", rec.previousHash, rec.adminHash, rec.hash];
  const suffixVariants = [createdAtStr, "", rec.adminHash, rec.hash];

  // ── Try all combinations of: payload type × extra fields × prefix × suffix ──
  for (const [pvLabel, pv] of Object.entries(payloadVariants)) {
    const withPayload = { ...baseFields, payload: pv };

    // Field set variants: with/without previousHash, with/without hash,
    // with/without systemSignature
    const fieldSets = {
      "globalPayload":                     { ...withPayload },
      "globalPayload+prevHash":            { ...withPayload, previousHash: rec.previousHash },
      "globalPayload+prevHash+hash":       { ...withPayload, previousHash: rec.previousHash, hash: rec.hash },
      "globalPayload+prevHash+hash+sysSig":{ ...withPayload, previousHash: rec.previousHash, hash: rec.hash, systemSignature: rec.systemSignature },
      "globalPayload+sysSig":              { ...withPayload, systemSignature: rec.systemSignature },
      "fullDoc":                           { ...withPayload, previousHash: rec.previousHash, hash: rec.hash, systemSignature: rec.systemSignature, tainted: rec.tainted },
    };

    for (const [fsLabel, fs] of Object.entries(fieldSets)) {
      const canon = canonicalize(fs);

      for (const prev of prevVariants) {
        for (const suffix of suffixVariants) {
          const sep = suffix ? `|${suffix}` : "";

          // With prev prefix
          if (tryHash(`payload=${pvLabel}, fields=${fsLabel}, prev="${prev}", suffix="${suffix}"`,
            `${prev}|${canon}${sep}`)) return;

          // Without any prefix (bare canon)
          if (tryHash(`payload=${pvLabel}, fields=${fsLabel}, NO-prev, suffix="${suffix}"`,
            `${canon}${sep}`)) return;
        }
      }
    }
  }

  // ── Maybe the hash input was the auditDoc JSON.stringify'd (not canonicalized) ──
  console.log("\nTrying JSON.stringify variants...");
  const fullAuditDoc = {
    eventType:       rec.eventType,
    payload:         rec.payload,
    signer:          rec.signer,
    signerPublicKey: rec.signerPublicKey,
    signature:       rec.signature,
    adminHash:       rec.adminHash,
    adminSeq:        rec.adminSeq,
    createdAt:       createdAtStr,
    previousHash:    rec.previousHash,
    hash:            rec.hash,
  };
  const fullWithSys = { ...fullAuditDoc, systemSignature: rec.systemSignature };

  if (tryHash("JSON.stringify(auditDoc without sys), prev|...|iso",
    `${rec.previousHash}|${JSON.stringify(fullAuditDoc)}|${createdAtStr}`)) return;
  if (tryHash("JSON.stringify(auditDoc with sys), prev|...|iso",
    `${rec.previousHash}|${JSON.stringify(fullWithSys)}|${createdAtStr}`)) return;
  if (tryHash("JSON.stringify(auditDoc without sys), bare",
    JSON.stringify(fullAuditDoc))) return;
  if (tryHash("JSON.stringify(auditDoc with sys), bare",
    JSON.stringify(fullWithSys))) return;

  // ── Maybe nowISO used in hash was slightly different from stored createdAt ──
  // The old code: const nowISO = now.toISOString() used for both adminHash and globalHash
  // adminHash = sha256(`${lastHash}|${canonicalPayload}|${nowISO}`)
  // We KNOW: sha256(`GENESIS|${payloadCanon}|${createdAtStr}`) = adminHash ✅
  // So nowISO = createdAtStr is confirmed correct.

  // ── Check: does adminHash verification tell us what canonicalPayload was? ──
  console.log("\n── Admin signature verification ──");
  const adminSigOnPayloadObj   = verifySignature(rec.signerPublicKey, payloadCanon, rec.signature);
  const adminSigOnPayloadStr   = verifySignature(rec.signerPublicKey, payloadStr,   rec.signature);
  console.log("Admin sig valid over canon(payload obj)?", adminSigOnPayloadObj);
  console.log("Admin sig valid over JSON.stringify(payload)?", adminSigOnPayloadStr);

  // ── Check system signature over every candidate ──
  console.log("\n── System signature verification (trying all candidates) ──");
  const sysPub = process.env.SYSTEM_PUBLIC_KEY;

  const sysCandidates = {
    "canon(auditDoc no sys)":          canonicalize(fullAuditDoc),
    "canon(auditDoc with sys)":        canonicalize(fullWithSys),
    "canon(globalPayload)":            canonicalize({ ...baseFields, payload: payloadObj }),
    "canon(globalPayload+prevHash)":   canonicalize({ ...baseFields, payload: payloadObj, previousHash: rec.previousHash }),
    "JSON.stringify(auditDoc no sys)": JSON.stringify(fullAuditDoc),
    "canon(payload only)":             payloadCanon,
    "JSON.stringify(payload)":         payloadStr,
  };

  for (const [label, str] of Object.entries(sysCandidates)) {
    const valid = verifySignature(sysPub, str, rec.systemSignature);
    if (valid) {
      console.log(`\n🎯 SYSTEM SIG VALID OVER: [${label}]`);
      console.log("This tells us the exact string the old code passed to signPayload()");
      console.log("INPUT:\n", str.slice(0, 500));

      try {
        const parsed = JSON.parse(str.startsWith("{") ? str : "{}");
        const { previousHash: _ph, hash: _h, systemSignature: _ss, ...gp } = parsed;
        const attempt = sha256Hex(`${rec.previousHash}|${canonicalize(gp)}|${createdAtStr}`);
        console.log("\nDerived globalHash attempt:", attempt);
        console.log("Matches stored hash?", attempt === rec.hash ? "✅ YES" : "❌ NO");
      } catch(e) { console.log("Could not parse signed string as JSON"); }
    } else {
      console.log(`  sys sig over [${label}]: ❌`);
    }
  }

  if (!found) {
    console.log("\n❌ No hash formula matched. The hash may have been computed server-side");
    console.log("   with data that differs from what's stored (e.g. payload was a string");
    console.log("   at hash time but stored as object, or createdAt was different).");
    console.log("\n   RECOMMENDATION: These 355 records cannot be re-verified by hash.");
    console.log("   Use signature verification only for legacy records.");
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });