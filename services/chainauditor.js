import crypto from "crypto";
import GlobalApproval from "../models/GlobalApproval.js";
import Candidate from "../models/User.js";
import AdminApproval from "../models/AdminApproval.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

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

function verifySignature(publicKeyPem, payloadStr, signatureBase64) {
  const verify = crypto.createVerify("sha256");
  verify.update(payloadStr);
  verify.end();
  return verify.verify(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    signatureBase64,
    "base64"
  );
}

// ── Full global chain audit ───────────────────────────────────────────────────
//
// The global chain is ONE linked list shared across all admins.
// Each record's previousHash points to the hash of the record before it
// (regardless of which admin wrote it). Auditing per-admin slices breaks
// the chain link check because lastHash won't match across admins.
// The only correct approach is to walk ALL records in insertion order.

export async function runAudit() {
  // Walk every record in the order they were appended to the global chain.
  // createdAt is an ISO string so lexicographic sort == chronological sort.
  const allRecords = await GlobalApproval.find({})
    .sort({ createdAt: 1 })
    .lean();

  let lastHash          = "GENESIS";
  let checkedRecords    = 0;
  const totalRecords    = allRecords.length;
  const compromisedAdmins = new Set();

  // Collect all affected candidates per admin in case of compromise
  const affectedByAdmin = {}; // adminId -> Set of candidateIds

  for (const record of allRecords) {
    checkedRecords++;
    const adminId = record.signer;

    if (!affectedByAdmin[adminId]) affectedByAdmin[adminId] = new Set();
    if (record.payload?.user) affectedByAdmin[adminId].add(record.payload.user);

    // ── 1. Verify the global hash ───────────────────────────────────────────
    let hashValid = false;

    if (record.globalHashInput) {
      // New records: recompute globalHash from the stored input string.
      const expectedHash = sha256Hex(record.globalHashInput);
      hashValid = record.hash === expectedHash;
    } else {
      // Legacy records: verify system signature over reconstructed auditDoc.
      try {
        const auditDoc = {
          adminHash:       record.adminHash,
          adminSeq:        record.adminSeq,
          createdAt:       record.createdAt,
          payload:         record.payload,
          previousHash:    record.previousHash,
          signer:          record.signer,
          signerPublicKey: record.signerPublicKey,
          signature:       record.signature,
          hash:            record.hash,
        };
        hashValid = verifySignature(
          process.env.SYSTEM_PUBLIC_KEY,
          canonicalize(auditDoc),
          record.systemSignature
        );
      } catch {
        hashValid = false;
      }
    }

    // ── 2. Verify the global chain link ────────────────────────────────────
    const chainLinkValid = record.previousHash === lastHash;

    // ── 3. Verify the per-admin hash (secondary check) ─────────────────────
    let adminChainValid = true;
    if (record.adminHashInput) {
      const expectedAdminHash = sha256Hex(record.adminHashInput);
      adminChainValid = record.adminHash === expectedAdminHash;
    }

    if (!hashValid || !chainLinkValid || !adminChainValid) {
      compromisedAdmins.add(adminId);
      console.error(
        `CHAIN COMPROMISED → admin=${adminId}, record=${checkedRecords}, ` +
        `hashValid=${hashValid}, chainLinkValid=${chainLinkValid}, adminChainValid=${adminChainValid}`
      );
      // Do NOT break — keep walking so we detect ALL compromised admins.
    }

    // Always advance the global cursor, even on failure, so subsequent
    // records can still be checked for their own hash validity.
    lastHash = record.hash;
  }

  console.log(
    `FINAL AUDIT → records=${totalRecords}, checked=${checkedRecords}, compromised=${compromisedAdmins.size}`
  );

  // ── Mark clean admins as SETTLED ─────────────────────────────────────────
  const allAdmins  = [...new Set(allRecords.map((r) => r.signer))];
  const cleanAdmins = allAdmins.filter((id) => !compromisedAdmins.has(id));

  for (const adminId of cleanAdmins) {
    await AdminApproval.updateMany(
      { adminId },
      { $set: { chainStatus: "SETTLED", auditedAt: new Date() } }
    );
    console.log(`Audit → admin=${adminId}, broken=false`);
  }

  // ── Mark compromised admins and flag their candidates ─────────────────────
  for (const adminId of compromisedAdmins) {
    const candidateIds = Array.from(affectedByAdmin[adminId] || []);

    await Candidate.updateMany(
      { _id: { $in: candidateIds } },
      { $set: { isVerified: false, tampered: true } }
    );

    await AdminApproval.updateMany(
      { adminId },
      { $set: { chainStatus: "COMPROMISED", compromisedAt: new Date() } }
    );

    await GlobalApproval.updateMany(
      { signer: adminId },
      { $set: { tainted: true } }
    );

    console.log(`Audit → admin=${adminId}, broken=true`);
  }

  return {
    totalRecords,
    checkedRecords,
    compromisedAdmins: compromisedAdmins.size,
  };
}

// ── Single-admin audit (for targeted checks, e.g. after a strike) ─────────────
//
// WARNING: This can only verify hash integrity (globalHashInput) and the
// per-admin chain (adminHashInput). It CANNOT verify the global chain link
// (previousHash) in isolation because the previous record may belong to a
// different admin. Use runAudit() for full integrity guarantees.

export async function auditChainForAdmin(adminId) {
  const approvals = await GlobalApproval.find({ signer: String(adminId) })
    .sort({ createdAt: 1 })
    .lean();

  let checkedRecords = 0;
  let brokenAt = null;
  const affectedCandidateIds = new Set();

  for (const record of approvals) {
    checkedRecords++;
    if (record.payload?.user) affectedCandidateIds.add(record.payload.user);

    // ── Verify global hash ──────────────────────────────────────────────────
    let hashValid = false;

    if (record.globalHashInput) {
      hashValid = record.hash === sha256Hex(record.globalHashInput);
    } else {
      try {
        const auditDoc = {
          adminHash:       record.adminHash,
          adminSeq:        record.adminSeq,
          createdAt:       record.createdAt,
          payload:         record.payload,
          previousHash:    record.previousHash,
          signer:          record.signer,
          signerPublicKey: record.signerPublicKey,
          signature:       record.signature,
          hash:            record.hash,
        };
        hashValid = verifySignature(
          process.env.SYSTEM_PUBLIC_KEY,
          canonicalize(auditDoc),
          record.systemSignature
        );
      } catch {
        hashValid = false;
      }
    }

    // ── Verify per-admin hash ───────────────────────────────────────────────
    let adminChainValid = true;
    if (record.adminHashInput) {
      adminChainValid = record.adminHash === sha256Hex(record.adminHashInput);
    }

    if (!hashValid || !adminChainValid) {
      brokenAt = checkedRecords;
      console.error(
        `CHAIN COMPROMISED → admin=${adminId}, record=${checkedRecords}, ` +
        `hashValid=${hashValid}, adminChainValid=${adminChainValid}`
      );
      break;
    }
  }

  console.log(
    `Audit → admin=${adminId}, total=${approvals.length}, checked=${checkedRecords}, broken=${!!brokenAt}`
  );

  if (!brokenAt) {
    await AdminApproval.updateMany(
      { adminId },
      { $set: { chainStatus: "SETTLED", auditedAt: new Date() } }
    );
    return { totalRecords: approvals.length, checkedRecords, broken: false };
  }

  const candidateIds = Array.from(affectedCandidateIds);

  await Candidate.updateMany(
    { _id: { $in: candidateIds } },
    { $set: { isVerified: false, tampered: true } }
  );

  await AdminApproval.updateMany(
    { adminId },
    { $set: { chainStatus: "COMPROMISED", compromisedAt: new Date() } }
  );

  await GlobalApproval.updateMany(
    { signer: String(adminId) },
    { $set: { tainted: true } }
  );

  return {
    totalRecords: approvals.length,
    checkedRecords,
    broken: true,
    brokenAt,
  };
}