import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const SUTABANDHANURL = process.env.DATABASE_URL;

// Main app DB
const sutabandhanConnection = mongoose.createConnection(SUTABANDHANURL);
sutabandhanConnection.once("open", () => {
  console.log("✅ SutaBandhan DB connected");
});

export { mongoose, sutabandhanConnection };
