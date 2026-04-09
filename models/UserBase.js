import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";
import { type } from "os";

const options = { discriminatorKey: "__t", timestamps: true };

const userBaseSchema = new mongoose.Schema(
  {
    firstName: { type: String },
    lastName: { type: String },
    userEmail: { type: String},
    phoneNumber: { type: Number },
    userPassword: { type: String },
    referenceCode: { type: String },
    lastActivity: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    lastLogoutTime: { type: Date,default: null },
    isLoggedIn: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    accessToken: { type: String },
  },
  { timestamps: true, collection: "User" },
  options
);

const UserBase = sutabandhanConnection.model("User", userBaseSchema);

export default UserBase;
