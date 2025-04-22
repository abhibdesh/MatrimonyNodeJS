import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Admin from "../models/AdminBase.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import QRCode from "qrcode";

const paymentRoutes = Router();

paymentRoutes.post( "/generate-qr-code", authMiddleware, updateLastActivity, async (req, res) => {
    try {
      const { planDuration, profileCount } = req.body;
      const candidate = await Candidate.findById(req.user._id);
      const localTimezone = "Asia/Kolkata"; // or your preferred TZ
      const today = moment().tz(localTimezone).startOf("day");

      const startOfDay = today.toDate();
      const endOfDay = moment(today).endOf("day").toDate();
      const atm = moment().tz(localTimezone);
      const amountPaid = 0;
      const validTill = null;

      if (planDuration === "1M" && profileCount === "10") {
        amountPaid = 499;
      }
      const count = await Payment.countDocuments({
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      });

      let transactionId = atm.format("YYYYMMDDHHMMss");
      if (count >= 0 && count < 10)
        transactionId = transactionId + "0000" + count;
      else if (count >= 10 && count < 100)
        transactionId = transactionId + "000" + count;
      else if (count >= 100 && count < 1000)
        transactionId = transactionId + "00" + count;

      console.log("Transaction ID:", transactionId);

      QRCode.toDataURL("I am a pony!")
        .then((url) => {
          console.log(url);
        })
        .catch((err) => {
          console.error(err);
        });

      res.status(200).json({
        message: "success",
        data: "Your payment is sent for approval.",
      });
    } catch (error) {
      res.status(500).json({ message: "success", data: error.message });
    }
  }
);

export default paymentRoutes;
