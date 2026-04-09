import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";

// createdAt is stored as String (ISO 8601), NOT Date.
//
// If stored as Date, Mongoose silently converts the ISO string on write and
// returns a Date object on read. Even though toISOString() usually round-trips
// correctly, any sub-millisecond rounding breaks the system signature because
// the verifier reconstructs createdAt from the stored value — not from memory.
// Storing as String guarantees what was signed is exactly what comes back.

const globalApprovalSchema = new mongoose.Schema(
  {
    // ── GLOBAL CHAIN ──────────────────────────────────────────────────────────
    previousHash:    { type: String, required: true },
    hash:            { type: String, required: true },

    // ── HASH INPUTS (stored so audit can recompute without guessing) ──────────
    // adminHashInput:  the string that was sha256'd to produce adminHash
    // globalHashInput: the string that was sha256'd to produce hash (globalHash)
    adminHashInput:  { type: String, required: true },
    globalHashInput: { type: String, required: true },

    // ── CORE DATA ─────────────────────────────────────────────────────────────
    payload:         { type: mongoose.Schema.Types.Mixed, required: true },
    eventType:       { type: String },

    // ── ADMIN INFO ────────────────────────────────────────────────────────────
    signer:          { type: String, required: true },
    signerPublicKey: { type: String, required: true },

    // ── SIGNATURES ────────────────────────────────────────────────────────────
    signature:       { type: String, required: true },   // admin sig over canonical payload
    systemSignature: { type: String, required: true },   // system sig over canonical auditDoc

    // ── ADMIN CHAIN LINK ──────────────────────────────────────────────────────
    adminHash:       { type: String, required: true },
    adminSeq:        { type: Number, required: true },

    // ── TIME — ISO string, never a Date ───────────────────────────────────────
    createdAt:       { type: String, required: true },

    // ── FLAGS ─────────────────────────────────────────────────────────────────
    tainted:         { type: Boolean, default: false },
    taintedAt:       { type: String },
  },
  {
    timestamps: false,          // we manage createdAt ourselves
    collection: "GlobalApproval",
  }
);

// Fast idempotency lookups
globalApprovalSchema.index({ "payload.idempotencyKey": 1 });

const GlobalApproval = sutabandhanConnection.model(
  "GlobalApproval",
  globalApprovalSchema
);

export default GlobalApproval;