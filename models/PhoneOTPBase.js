import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";


const phoneOTPSchema = new mongoose.Schema(
  {
    OTP: { type: String },
    isUsed: { type: Boolean, default: false },
    phoneNumber: { type: Number },
  },
  { timestamps: true, collection: "PhoneValidations" }
);

const phoneOTP = sutabandhanConnection.model("PhoneValidations", phoneOTPSchema);

export default phoneOTP;
