import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";


const paymentSchema = new mongoose.Schema(
  {
    payerName:        { type: String },
    planDuration:     { type: String, required: true },
    profileCount:     { type: Number, required: true },
    amountPaid:       { type: Number, required: true },

    // unique transaction identifier
    transactionId:    { type: String, required: true, unique: true },

    // life‑cycle status field
    status: {
      type: String,
      enum: [
        "QR_GENERATED",         // QR upserted, awaiting user “Done”
        "PAID_PENDING_APPROVAL",// user clicked Done
        "APPROVED",             // admin approved
        "REJECTED"              // admin rejected or expired
      ],
      default: "QR_GENERATED",
      required: true
    },

    paidAt:           { type: Date },   // timestamp of “Done” click
    validTill:        { type: Date },   // your existing validity window
    
    // approval workflow
    isApproved:       { type: Boolean, default: false },
    approvalTimestamp:{ type: Date },

    userEmail:        { type: String },
    referenceCode:    { type: String },

    totalProfilesViewed: { type: Number, default: 0 },
    savedProfiles:       { type: [String], default: [] },
    isPaymentSettled:    { type: Boolean, default: false }
  },
  {
    timestamps: true,
    collection: "PaymentsInfo",
  }
);

// TTL index to auto‑expire unconfirmed QR_GENERATED after 15 mins
paymentSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 15 * 60 , partialFilterExpression: { status: "QR_GENERATED" } }
);

export default sutabandhanConnection.model("Payment", paymentSchema);
