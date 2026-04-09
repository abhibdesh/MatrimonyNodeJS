import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

import userRoutes, { setGridFSBucket } from "./routes/userRoutes.js"; 
import commonRoutes from "./routes/commonRoutes.js"; 
import ownerRoutes from "./routes/ownerRoutes.js"; 
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import cronjobRoutes from "./routes/cronjobRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";

import { mongoose, sutabandhanConnection } from "./dbConnections.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log("CORS check:", req.headers.origin);
  next();
});

const allowedOrigins = process.env.ENVIRONMENT.split(",").map(o => o.trim());
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/common", commonRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/email-routes", emailRoutes);
app.use("/api/cronjobRoutes", cronjobRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
