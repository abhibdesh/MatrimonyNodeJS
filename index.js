import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser"
import userRoutes, { setGridFSBucket } from "./routes/userRoutes.js"; 
import commonRoutes from "./routes/commonRoutes.js"; 
import ownerRoutes from "./routes/ownerRoutes.js"; 
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import dotenv from 'dotenv';
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;
const MONGO_URI = process.env.DATABASE_URL
  

// Middleware
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "http://localhost:5173", 
    credentials: true, 
  })
);
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db);
    setGridFSBucket(bucket); 
    console.log('MongoDB connected and GridFSBucket initialized');
  })
  .catch(err => console.error('MongoDB connection error:', err));

mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connection established");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected. Trying to reconnect...");
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/common", commonRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
