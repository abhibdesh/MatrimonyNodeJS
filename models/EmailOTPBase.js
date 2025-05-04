import mongoose from "mongoose";

const emailOTPSchema = new mongoose.Schema(
  {
    OTP: { type: String },
    isUsed: { type: Boolean, default: false },
    userId: { type: String }
  },
  { timestamps: true, collection: "EmailValidations" }
);

const emailOTP = mongoose.model("EmailValidations", emailOTPSchema);

export default emailOTP;
