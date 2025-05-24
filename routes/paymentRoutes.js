import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import QRCode from "qrcode";

const paymentRoutes = Router();

paymentRoutes.post(
  "/generate-qr-code",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if(req.user.__t ==="candidate"){
        const { planDuration, profileCount } = req.body;
        console.log(planDuration)
        console.log(profileCount)
        const candidate = await Candidate.findById(req.user._id);
        const localTimezone = "Asia/Kolkata";
        const today = moment().tz(localTimezone).startOf("day");
  
        const startOfDay = today.toDate();
        const endOfDay = moment(today).endOf("day").toDate();
        const atm = moment().tz(localTimezone);
        let amountPaid;
        let validTill;
        let countOfProfiles;
  
        if (planDuration === "1") {
          validTill = atm.clone().add(1, "months");
          if (profileCount === "10") {
            amountPaid = 499;
            countOfProfiles = 10;
          }
          if (profileCount === "25") {
            amountPaid = 999;
            countOfProfiles = 25;
          }
          if (profileCount === "30") {
            amountPaid = 1299;
            countOfProfiles = 30;
          }
          if (profileCount === "Unlimited") {
            amountPaid = 1599;
            countOfProfiles = 0;
          }
        }
        if (planDuration === "3") {
          validTill = atm.clone().add(3, "months");
          if (profileCount === "10") {
            amountPaid = 899;
            countOfProfiles = 30;
          }
          if (profileCount === "25") {
            amountPaid = 1399;
            countOfProfiles = 25;
          }
          if (profileCount === "30") {
            amountPaid = 1599;
            countOfProfiles = 30;
          }
          if (profileCount === "Unlimited") {
            amountPaid = 1999;
            countOfProfiles = 0;
          }
        }
        if (planDuration === "6") {
          validTill = atm.clone().add(6, "months");
          if (profileCount === "10") {
            amountPaid = 1299;
            countOfProfiles = 10;
          }
          if (profileCount === "25") {
            amountPaid = 1699;
            countOfProfiles = 25;
          }
          if (profileCount === "30") {
            amountPaid = 1999;
            countOfProfiles = 30;
          }
          if (profileCount === "Unlimited") {
            amountPaid = 2499;
            countOfProfiles = 0;
          }
        }
        if (planDuration === "9") {
          validTill = atm.clone().add(9, "months");
          if (profileCount === "10") {
            amountPaid = 1299;
            countOfProfiles = 10;
          }
          if (profileCount === "25") {
            amountPaid = 1599;
            countOfProfiles = 25;
          }
          if (profileCount === "30") {
            amountPaid = 1999;
            countOfProfiles = 30;
          }
          if (profileCount === "Unlimited") {
            amountPaid = 2499;
            countOfProfiles = 0;
          }
        }
  
        if (planDuration === "1Y") {
          {
            validTill = atm.clone().add(12, "months");
            amountPaid = 4999;
            countOfProfiles = 0;
          }
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
  
        const upiId = "abhibdesh@okaxis";
        const note =
          "Plan period " +
          planDuration +
          " Profile Count " +
          profileCount +
          " Transaction " +
          transactionId;
        const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
          "Fyjix"
        )}&mc=&tid=${transactionId}&tr=${transactionId}&tn=${encodeURIComponent(
          note
        )}&am=${amountPaid}&cu=INR`;
        console.log(upiLink)
        if (req.user.__t === "candidate") {
          await Payment.create({
            payerName: candidate.firstName + " " + candidate.lastName,
            planDuration: planDuration,
            profileCount: countOfProfiles,
            savedProfiles: [],
            amountPaid: amountPaid,
            validTill: validTill,
            userId: candidate._id,
            userEmail: candidate.userEmail,
            referenceCode: candidate.referenceCode,
            transactionId: transactionId,
          });
          const image = await QRCode.toDataURL(upiLink, {
            errorCorrectionLevel: "H",
          });
          return res.status(200).json({
            message: "success",
            data: image,
          });
        }      
      } else {
        return res
          .status(401)
          .json({
            message: "failure",
            data: "You are unauthorised to generate QR code",
          });
      }
    } catch (error) {
      console.log(error)
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

paymentRoutes.get(
  "/get-my-payments",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if(req.user.__t === "candidate"){
        const todayDate = new Date();
        const paymentCollection = await Payment.find({ userId: req.user._id })
          .sort({ createdAt: -1 })
          const paymentData = [];
        
          for (let doc of paymentCollection) {
            doc = doc.toObject();
          
            doc.totalProfilesViewed = doc.savedProfiles?.length || 0;
            doc.validity = doc.validTill;
          
            const validTillDate = new Date(doc.validTill);
            const isExpired = validTillDate < todayDate;
          
            if (
              (doc.profileCount !== 0 && doc.totalProfilesViewed >= doc.profileCount) ||
              isExpired
            ) {
              doc.validTill = "Validity Expired";
            }
            paymentData.push(doc);
          }
          
        return res.status(200).json({
          message: "success",
          data: paymentData,
        });
      }
      else{
        return res.status(401).json({ message: "failure", data: "Your are unauthorised to get payments" });
      }
    } catch (error) {
      console.log(error)
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

export default paymentRoutes;
