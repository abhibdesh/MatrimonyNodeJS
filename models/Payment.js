import mongoose from "mongoose";

const paymentSchema = mongoose.Schema(
  {
    payerName: { type: String },
    planDuration: { type: String },
    profileCount: { type: String },
    isApproved: { type: Boolean, default: false },
    amountPaid: { type: Number },
    transactionId:{type:String},
    validTill: { type: Date },
    userId: { type: String },
    userEmail: { type: String },
    referenceCode: { type: String },
    totalProfilesViewed: { type: Number, default:0 },
    savedProfiles: { type: [String], default: [] },
    approvalTimestamp: { type: Date },
    isPaymentSettled: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    collection: "PaymentsInfo",
  }
);

const Payment = mongoose.model("PaymentsInfo", paymentSchema);

export default Payment;
