import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";


const strikeBase = new mongoose.Schema(
  {
    user: { type: String },
    reason: { type: String },
  },
  { timestamps: true, collection: "StrikeLogs" }
);

const Strike = sutabandhanConnection.model("EmailValidations", strikeBase);

export default Strike;
