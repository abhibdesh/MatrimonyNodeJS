import mongoose from "mongoose";

const phoneOTPSchema = new mongoose.Schema(
  {
    OTP: { type: String },
    isUsed: { type: Boolean, default: false },
    userId: { type: String }
  },
  { timestamps: true, collection: "PhoneValidations" }
);

const phoneOTP = mongoose.model("PhoneValidations", phoneOTPSchema);

export default phoneOTP;
