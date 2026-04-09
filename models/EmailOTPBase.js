import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";

const emailOTPSchema = new mongoose.Schema(
  {
    OTP: { type: String },
    isUsed: { type: Boolean, default: false },
    userId: { type: String }
  },
  { timestamps: true, collection: "EmailValidations" }
);

const emailOTP = sutabandhanConnection.model("EmailValidations", emailOTPSchema);

export default emailOTP;
