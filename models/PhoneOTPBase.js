import mongoose from "mongoose";

const phoneOTPSchema = new mongoose.Schema(
  {
    OTP: { type: String },
    isUsed: { type: Boolean, default: false },
    phoneNumber: { type: Number },
  },
  { timestamps: true, collection: "PhoneValidations" }
);

const phoneOTP = mongoose.model("PhoneValidations", phoneOTPSchema);

export default phoneOTP;
