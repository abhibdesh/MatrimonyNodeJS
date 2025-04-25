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
      let amountPaid;
      let validTill;

      if (planDuration === "1M") {
        validTill = atm.clone().add(1, "months");
        if(profileCount === "10")
            amountPaid = 499;
        if(profileCount === "20")
            amountPaid = 899;
        if(profileCount === "30")
            amountPaid = 1299;
        if(profileCount === "Unlimited")
            amountPaid = 1599;
      }
      if (planDuration === "3M") {
        validTill = atm.clone().add(3, "months");
        if(profileCount === "10")
            amountPaid = 899;
        if(profileCount === "20")
            amountPaid = 1299;
        if(profileCount === "30")
            amountPaid = 1599;
        if(profileCount === "Unlimited")
            amountPaid = 1999;
      }
      if (planDuration === "6M") {
        validTill = atm.clone().add(6, "months");
        if(profileCount === "10")
            amountPaid = 1299;
        if(profileCount === "20")
            amountPaid = 1599;
        if(profileCount === "30")
            amountPaid = 1999;
        if(profileCount === "Unlimited")
            amountPaid = 2499;
      }
      if (planDuration === "9M") {
        validTill = atm.clone().add(9, "months");
        if(profileCount === "10")
            amountPaid = 1299;
        if(profileCount === "20")
            amountPaid = 1599;
        if(profileCount === "30")
            amountPaid = 1999;
        if(profileCount === "Unlimited")
            amountPaid = 2499;
      }

      if(planDuration === "1Y"){
        validTill = atm.clone().add(12, "months");
        amountPaid = 4999
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

      const upiId = "abhibdesh@okaxis"
      const note = "Plan period " + planDuration + " Profile Count " + profileCount + " Transaction " + transactionId
      const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent("Fyjix")}&mc=&tid=${transactionId}&tr=${transactionId}&tn=${encodeURIComponent(note)}&am=${amountPaid}&cu=INR`;
      console.log(upiLink)  
      await Payment.create({
        payerName : candidate.firstName + " " + candidate.lastName,
        planDuration: planDuration,
        profileCount:profileCount,
        amountPaid:amountPaid,
        validTill:validTill,
        userId: candidate._id,
        userEmail: candidate.userEmail,
        referenceCode:candidate.referenceCode,
        transactionId:transactionId
      })
      const image = await QRCode.toDataURL(upiLink, { errorCorrectionLevel: "H" });
      res.status(200).json({
        message: "success",
        data: image,
      });
    } catch (error) {
      res.status(500).json({ message: "success", data: error.message });
    }
  }
);

export default paymentRoutes;
