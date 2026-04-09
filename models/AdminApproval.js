import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";

const adminApprovalSchema = new mongoose.Schema(
  {
    adminId: { type: String },
    lastHash: { type: Object },
    lastSeq: { type: String },
    dayKey: { type: String },
    idempotencyKey: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    chainStatus:{type:String, default:""},
    auditedAt: { type: Date, default: null },

  },
  { timestamps: false, collection: "AdminApproval" }
);

const AdminApproval = sutabandhanConnection.model("AdminApproval", adminApprovalSchema);

export default AdminApproval;