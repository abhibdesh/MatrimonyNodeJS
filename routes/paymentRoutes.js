import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Payment from "../models/Payment.js";
import {
  calculateAmount,
  generateTxnId,
  buildUpiLink,
  generateQrImage,
  getValidTill,
} from "../Utils/utils.js";

const paymentRoutes = Router();

paymentRoutes.post(
  "/generate-qr-code",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "candidate") {
        const { planDuration, profileCount } = req.body;
        const amountPaid = calculateAmount(planDuration, profileCount);
        const validTill = getValidTill(planDuration);
        const transactionId = generateTxnId();
        await Payment.findOneAndUpdate(
          { userEmail: req.user.userEmail, transactionId },
          {
            $set: {
              planDuration,
              profileCount:
                profileCount === "Unlimited" ? 0 : parseInt(profileCount),
              amountPaid,
              status: "QR_GENERATED",
              validTill: validTill,
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );

        const upiLink = buildUpiLink({
          transactionId,
          amount: amountPaid,
          planDuration,
          profileCount,
        });
        const qrImage = await generateQrImage(upiLink);

        return res.status(200).json({
          txn_id: transactionId,
          amount: amountPaid,
          data: qrImage,
        });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to generate QR code",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

// paymentRoutes.post(
//   "/mark-payment-done",
//   authMiddleware,
//   updateLastActivity,
//   async (req, res) => {
//     try {
//       if (req.user.__t === "candidate") {
//         const { transactionId } = req.body;
//         const refCode = await Candidate.findOne({"userEmail":req.user.userEmail})
//         console.log(req.user._id)
// const payment = await Payment.findOneAndUpdate(
//   { userId: req.user._id, transactionId },
//   {
//     status: "PAID_PENDING_APPROVAL",
//     paidAt: new Date(),
//     referenceCode: refCode.referenceCode
//   },
//   { new: true }
// );
//         if (!payment) {
//           return res.status(406).json({ message: "failure", data: "Invalid transactionId" });
//         }
//         return res.status(200).json({ message: "success", data: "Payment confirmed" });
//       } else {
//         return res.status(401).json({
//           message: "failure",
//           data: "You are unauthorised to generate QR code",
//         });
//       }
//     } catch (error) {
//       console.log(error);
//       return res.status(500).json({ message: "failure", data: error.message });
//     }
//   }
// );

paymentRoutes.post(
  "/confirm-payment",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    const { transactionId } = req.body;
    console.log(transactionId);
    const refCode = await Candidate.findOne({ userEmail: req.user.userEmail });
    console.log(refCode.referenceCode);
    console.log(refCode.referenceCode);
    await Payment.findOneAndUpdate(
      { userEmail: req.user.userEmail, transactionId },
      {
        status: "PAID_PENDING_APPROVAL",
        paidAt: new Date(),
        referenceCode: refCode.referenceCode,
      },
      { new: true }
    );
    return res
      .status(200)
      .json({ message: "success", data: "Payment confirmed" });
  }
);

paymentRoutes.post(
  "/clear-data",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { transaction } = req.body;
      console.log("Deleting transaction:", transaction);

      const payment = await Payment.deleteOne({ transactionId: transaction });

      if (payment.deletedCount === 0) {
        return res
          .status(404)
          .json({ message: "failure", data: "No matching payment found" });
      }

      return res
        .status(200)
        .json({ message: "success", data: "Payment deleted" });
    } catch (error) {
      console.error(error);
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
      if (req.user.__t === "candidate") {
        const todayDate = new Date();
        const paymentCollection = await Payment.find({
          userEmail: req.user.userEmail,
          status: { $in: ["PAID_PENDING_APPROVAL", "APPROVED"] },
        }).sort({ createdAt: -1 });
        const paymentData = [];

        for (let doc of paymentCollection) {
          doc = doc.toObject();

          doc.totalProfilesViewed = doc.savedProfiles?.length || 0;
          doc.validity = doc.validTill;

          const validTillDate = new Date(doc.validTill);
          const isExpired = validTillDate < todayDate;

          if (
            (doc.profileCount !== 0 &&
              doc.totalProfilesViewed >= doc.profileCount) ||
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
      } else {
        return res.status(401).json({
          message: "failure",
          data: "Your are unauthorised to get payments",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

export default paymentRoutes;
