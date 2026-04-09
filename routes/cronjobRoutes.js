import express from "express";
import { runAudit } from "../services/chainauditor.js";

const cronjobRoutes = express.Router();

cronjobRoutes.post("/validate-chain", async (req, res) => {
  try {
    const start = process.hrtime.bigint(); // high precision timer
    await runAudit(); // IMPORTANT: await it  
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    console.log(`Audit completed in ${durationMs.toFixed(2)} ms`);
    return res.status(200).json({
      message: "success",
      auditTimeMs: durationMs,
    });
    } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

export default cronjobRoutes;
