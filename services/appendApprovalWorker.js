import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

import Admin from '../models/AdminBase.js';
import { sutabandhanConnection } from '../dbConnections.js';
import GlobalApproval from '../models/GlobalApproval.js';
import AdminApproval from '../models/AdminApproval.js';
import GlobalChainState from '../models/GlobalChainState.js';
import Candidate from '../models/User.js';

const MAX_RETRIES = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function decryptPrivateKey(encryptedPrivateKey, secretKey) {
  const keyObj =
    typeof encryptedPrivateKey === 'string'
      ? JSON.parse(encryptedPrivateKey)
      : encryptedPrivateKey;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(secretKey, 'hex'),
    Buffer.from(keyObj.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(keyObj.authTag, 'hex'));

  let decrypted = decipher.update(keyObj.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function signPayload(privateKeyPem, payloadStr) {
  const sign = crypto.createSign('sha256');
  sign.update(payloadStr);
  sign.end();
  return sign.sign(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    'base64'
  );
}

function verifySignature(publicKeyPem, payloadStr, signatureBase64) {
  const verify = crypto.createVerify('sha256');
  verify.update(payloadStr);
  verify.end();
  return verify.verify(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    signatureBase64,
    'base64'
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function appendApprovalTransactional(
  adminId,
  candidateId,
  payloadObj,
  idempotencyKey,
  community
) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await sutabandhanConnection.startSession();

    try {
      session.startTransaction();

      const now = new Date();
      const nowISO = now.toISOString();

      const payloadData =
        typeof payloadObj === 'string' ? JSON.parse(payloadObj) : payloadObj;

      const payloadWithKey = { ...payloadData, idempotencyKey };

      // ── Idempotency check ─────────────────────────────────────────────────
      const existing = await GlobalApproval.findOne({
        'payload.idempotencyKey': idempotencyKey,
      }).session(session);

      if (existing) {
        await session.commitTransaction();
        session.endSession();
        return { ok: true, already: true };
      }

      // ── Admin chain ───────────────────────────────────────────────────────
      const dayKey = now.toISOString().slice(0, 10);

      let chainRow = await AdminApproval.findOne({ adminId, dayKey }).session(session);

      if (!chainRow) {
        chainRow = await AdminApproval.findOneAndUpdate(
          { adminId, dayKey },
          {
            $setOnInsert: {
              adminId,
              dayKey,
              lastHash: 'GENESIS',
              lastSeq: 0,
              updatedAt: now,
            },
          },
          { upsert: true, new: true, session }
        );
      }

      const lastAdminHash = chainRow.lastHash || 'GENESIS';
      const seq = (chainRow.lastSeq || 0) + 1;

      const canonicalPayload = canonicalize(payloadWithKey);

      // adminHashInput is stored so the audit can recompute adminHash exactly.
      const adminHashInput = `${lastAdminHash}|${canonicalPayload}|${nowISO}`;
      const adminHash = sha256Hex(adminHashInput);

      // ── Admin signature over the canonical payload ─────────────────────────
      const admin = await Admin.findById(adminId).session(session);

      const privateKeyPem = decryptPrivateKey(
        admin.privateKey,
        process.env.PRIVATE_KEY_ENCRYPTION
      );

      const signatureBase64 = signPayload(privateKeyPem, canonicalPayload);

      if (!verifySignature(admin.publicKeyPem, canonicalPayload, signatureBase64)) {
        throw new Error('Admin signature invalid');
      }

      // ── Global chain ──────────────────────────────────────────────────────
      let state = await GlobalChainState.getOrCreate(session);
      const globalPrevHash = state.lastHash;
      const oldVersion = state.version;

      // docForHashing must NOT contain hashInput or any intermediate value —
      // only fields that are stored in the schema, so the audit can reconstruct
      // canonicalize(docForHashing) from what is saved in MongoDB.
      const docForHashing = {
        adminHash,
        adminSeq:        seq,
        createdAt:       nowISO,
        payload:         payloadWithKey,
        previousHash:    globalPrevHash,
        signer:          String(adminId),
        signerPublicKey: admin.publicKeyPem,
        signature:       signatureBase64,
      };

      // globalHashInput is stored so the audit can recompute hash exactly.
      const globalHashInput = `${globalPrevHash}|${canonicalize(docForHashing)}|${nowISO}`;
      const globalHash = sha256Hex(globalHashInput);

      // auditDoc = everything the system will sign. hash is included so the
      // system signature covers the final global hash too.
      const auditDoc = { ...docForHashing, hash: globalHash };

      const canonicalAuditDoc = canonicalize(auditDoc);

      const systemSignature = signPayload(
        process.env.SYSTEM_PRIVATE_KEY,
        canonicalAuditDoc
      );

      if (
        !verifySignature(
          process.env.SYSTEM_PUBLIC_KEY,
          canonicalAuditDoc,
          systemSignature
        )
      ) {
        throw new Error('System signature invalid');
      }

      // ── Build the document to store ───────────────────────────────────────
      // adminHashInput and globalHashInput are stored alongside the record so
      // the audit function can recompute both hashes deterministically without
      // guessing the formula or missing any field.
      const docToStore = {
        ...auditDoc,
        adminHashInput,     // stored: lets audit recompute adminHash
        globalHashInput,    // stored: lets audit recompute hash (globalHash)
        systemSignature,
      };

      // ── Optimistic concurrency on GlobalChainState ────────────────────────
      const updatedState = await GlobalChainState.findOneAndUpdate(
        { _id: state._id, version: oldVersion },
        {
          $set: {
            lastHash: globalHash,
            lastSeq:  state.lastSeq + 1,
            version:  oldVersion + 1,
          },
        },
        { session, new: true }
      );

      if (!updatedState) {
        await session.abortTransaction();
        session.endSession();
        continue; // retry
      }

      // ── Persist ───────────────────────────────────────────────────────────
      await GlobalApproval.create([docToStore], { session });

      await Candidate.findOneAndUpdate(
        { _id: candidateId, isVerified: false },
        {
          $set: {
            isVerified: true,
            hash:       adminHash,
            community,
          },
        },
        { session }
      );

      await AdminApproval.findOneAndUpdate(
        { adminId, dayKey, lastHash: chainRow.lastHash },
        {
          $set: { lastHash: adminHash, lastSeq: seq, updatedAt: now },
        },
        { new: true, session }
      );

      await session.commitTransaction();
      session.endSession();

      return { ok: true, auditHash: globalHash };
    } catch (err) {
      try { await session.abortTransaction(); } catch {}
      session.endSession();
      if (attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }

  throw new Error('Failed after max retries');
}