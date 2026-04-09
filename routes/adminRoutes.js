import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Admin from "../models/AdminBase.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import mongoose from "mongoose";
import { decryptPrivateKey, verifyKeys } from "../middleware/signerVerify.js";
import { createHash, sign } from "crypto";
import crypto from "crypto";
import { appendApprovalTransactional } from "../services/appendApprovalWorker.js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const adminRoutes = Router();

function getCloudinaryPrivateURL(public_id) {
  if (public_id === "") {
    return "";
  } else {
    const signedUrl = cloudinary.url(public_id, {
      type: "authenticated",
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    return signedUrl;
  }
}

adminRoutes.post(
  "/verify-candidate",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    const { userId } = req.body;
    try {
      if (req.user.__t === "candidate") {
        return res.status(401).json({
          message: "failure",
          message: "You are unauthorised to verify a candidate",
        });
      } else {
        const user = await Candidate.findById(userId);
        if (!user) {
          return res
            .status(200)
            .json({ message: "failure", data: "User not found" });
        } else {
          await Candidate.findByIdAndUpdate(userId, {
            $set: { isVerified: true },
          });
          return res.status(200).json({
            message: "success",
            data: "Candidate verfied successfully",
          });
        }
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

adminRoutes.get(
  "/get-users-without-community",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      let users = [];

      if (req.user.__t === "admin") {
        const admin = await Admin.findById(req.user._id);
        users = await Candidate.find(
          {
            __t: "candidate",
            referenceCode: admin.referenceCode,
            community: "",
          },
          {
            _id: 1,
            firstName: 1,
            lastName: 1,
            userEmail: 1,
            isEmailVerified: 1,
            phoneNumber: 1,
            isPhoneVerified: 1,
            image: 1,
          }
        );
      } else if (req.user.__t === "owner") {
        users = await Candidate.find(
          {
            __t: "candidate",
            referenceCode: "",
          },
          {
            _id: 1,
            firstName: 1,
            lastName: 1,
            userEmail: 1,
            isEmailVerified: 1,
            phoneNumber: 1,
            isPhoneVerified: 1,
            image: 1,
          }
        );
      } else if (req.user.__t === "candidate") {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorized to get this information",
        });
      }

      // Convert image public_id to signed Cloudinary URLs
      const usersWithImages = users.map((user) => ({
        ...user._doc,
        image: getCloudinaryPrivateURL(user.image || ""),
      }));

      return res.status(200).json({ message: "success", data: usersWithImages });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

adminRoutes.post(
  "/assign-community-to-candidate",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "candidate") {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to assign community",
        });
      } else {
        const row = await Admin.findById(req.user._id);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const strikesToday = row.approvalsToday;

        // if (strikesToday > 10 && row.status === "active") {
        //   await Admin.findByIdAndUpdate(req.user._id, {
        //     status: "frozen",
        //     $push: { strikes: { reason: "Exceeded daily approvals" } },
        //   });
        //   return res.status(400).json({
        //     message: "failure",
        //     data: "Exceeded daily approvals",
        //   });
        // } else {
          if (row.status === "active") {
            const { _id, community, deviceData } = req.body;
            // const secretKey = process.env.PRIVATE_KEY_ENCRYPTION;

            // const privateKeyPem = decryptPrivateKey(row.privateKey, secretKey);

            const ipAddress =
              req.headers["x-forwarded-for"] || // standard header for proxies
              req.connection.remoteAddress || // fallback for direct connection
              req.socket.remoteAddress ||
              (req.connection.socket
                ? req.connection.socket.remoteAddress
                : null);

            const payload = JSON.stringify({
              ip: ipAddress,
              user: req.user._id,
              deviceData: deviceData,
            });
            
            const result = await appendApprovalTransactional(
              row._id,
              _id,
              payload,
              crypto.randomUUID(),
              community
            );

            // This code is used for single sign by the admin and is backup. Never to be removed.
            // const hash = createHash("sha256").update(payload).digest("hex");

            // const signature = sign("sha256", Buffer.from(payload), {
            //   key: privateKeyPem,
            //   padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            // });
            // const signatureBase64 = signature.toString("base64");

            // const isValid = verifyKeys(
            //   payload,
            //   signatureBase64,
            //   row.publicKeyPem
            // );

            // if (isValid) {
            if (result.ok) {
                 await Admin.findByIdAndUpdate(req.user._id, {
                $inc: { approvalsToday: 1 },
                deviceData,
              });
              return res.status(200).json({
                message: "success",
                data: "Community Assigned Successfully",
              });
             
              // // Assuming you have adminId
           
            } else {
              // Step 1 (soft fail): When signature verification fails, flag the candidate record as tampered: true. Don’t show them as verified.
              // Step 2 (admin accountability): Link that tampered record back to the admin who approved it. If multiple failures occur from the same admin, freeze the admin account, not the user.
              // Step 3 (audit log): Record the failure in an immutable audit log (reason: “Signature verification failed”).
              // Step 4 (owner escalation): Notify the owner (you) — so you can manually investigate.
              return res.status(400).json({
                message: "failure",
                data: "The data may have been tampered",
              });
            }
          } else {
            return res.status(400).json({
              message: "failure",
              data: "Your account status is " + row.status,
            });
          }
        }
    //  }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

adminRoutes.post(
  "/get-my-references",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t !== "admin") {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to get the references",
        });
      } else {
        const user = req.user._id;
        const { rowsPerPage, pageNumber } = req.body;
        const currentUser = await Admin.findById(user);
        const references = await Payment.find({
          referenceCode: currentUser.referenceCode,
          isApproved: true,
        })
          .sort({ approvalTimestamp: -1 })
          .skip((pageNumber - 1) * rowsPerPage)
          .limit(rowsPerPage);
        const totalCount = await Payment.countDocuments({
          referenceCode: currentUser.referenceCode,
          isApproved: true,
        });
        const localTimezone = "Asia/Kolkata";
        const atm = moment().tz(localTimezone);
        const currentMonth = atm.month() + 1;
        const currentMonthName = atm.format("MMMM");
        const currentYear = atm.year();

        const result = await Payment.aggregate([
          {
            $match: {
              referenceCode: currentUser.referenceCode,
              isApproved: true,
              isPaymentSettled: false,
            },
          },
          {
            $addFields: {
              approvalMonth: { $month: "$approvalTimestamp" },
              approvalYear: { $year: "$approvalTimestamp" },
            },
          },
          {
            $match: {
              approvalMonth: currentMonth,
              approvalYear: currentYear,
            },
          },
          {
            $group: {
              _id: null,
              unsettledAmount: { $sum: "$amountPaid" },
            },
          },
        ]);

        const unsettledAmount = result[0]?.unsettledAmount || 0;
        let originalPayableAmount =
          (unsettledAmount * currentUser.percentageShare) / 100;

        const data = {
          references: references,
          unsettledAmount: Math.ceil(originalPayableAmount),
          percentageShare: currentUser.percentageShare,
          total: totalCount,
          currentMonthYear: currentMonthName + "," + currentYear.toString(),
        };
        return res.status(200).json({ message: "success", data: data });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

adminRoutes.get(
  "/get-my-community-list",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "admin" || req.user.__t === "owner") {
        const user = await UserBase.findById(req.user._id);
        return res
          .status(200)
          .json({ message: "success", data: user.communityList });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unaithorised to see this",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

adminRoutes.post(
  "/get-report-data",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { type, paidUnpaid, from, to } = req.body;
      console.log(type);
      console.log(paidUnpaid);
      console.log(from);
      console.log(to);
      if (req.user.__t === "candidate") {
        return res.status(401).json({
          message: "success",
          data: "You are unauthorised to get this information",
        });
      }
      if (req.user.__t === "admin") {
        const refCodeEmailMapping = await Admin.findOne({
          userEmail: req.user.userEmail,
        });
        const referenceCode = refCodeEmailMapping.referenceCode;
        if (type === "Users") {
          if (paidUnpaid === "Paid") {
            const data = await Payment.find({
              referenceCode: referenceCode,
              isApproved: true,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $in: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "Unpaid") {
            const data = await Payment.find({
              referenceCode: referenceCode,
              isApproved: true,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $nin: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "Pending") {
            const data = await Payment.find({
              referenceCode: referenceCode,
              isApproved: false,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $in: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "") {
            const users = await UserBase.find({
              referenceCode: referenceCode,
              isActive: true,
            });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
        }
        if (type === "Payments") {
          if (paidUnpaid === "Paid") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              referenceCode: referenceCode,
              isApproved: true,
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }

                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
          if (paidUnpaid === "Unpaid") {
            // Step 1: Get all users with the given reference code
            const UserData = await UserBase.find({
              referenceCode: referenceCode,
              __t: "candidate",
            });

            // Step 2: Extract user IDs
            const allUserIds = UserData.map((d) => d._id.toString());
            console.log("allUserIds");
            console.log(allUserIds);
            // Step 3: Get userIds from payments
            const paidPayments = await Payment.find({
              userId: { $in: allUserIds },
              referenceCode: referenceCode,
            });

            const paidUserIds = paidPayments.map((p) => p.userId.toString());

            // Step 4: Filter out paid users
            const unpaidUsers = UserData.filter(
              (user) => !paidUserIds.includes(user._id.toString())
            );

            // Step 5: Return only unpaid users
            return res.status(200).json({
              message: "success",
              data: unpaidUsers,
              type: type,
            });
          }

          if (paidUnpaid === "Pending") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              referenceCode: referenceCode,
              isApproved: false,
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }
                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
          if (paidUnpaid === "") {
            return res
              .status(200)
              .json({ message: "success", data: [], type: type });
          }
        }
      }
      if (req.user.__t === "owner") {
        if (type === "Users") {
          if (paidUnpaid === "Paid") {
            const data = await Payment.find({
              isApproved: true,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $in: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "Unpaid") {
            const data = await Payment.find({
              isApproved: true,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $nin: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "Pending") {
            const data = await Payment.find({
              isApproved: false,
              validTill: { $gte: new Date() },
            });
            const usersList = data.map(
              (d) => new mongoose.Types.ObjectId(d.userId)
            );
            const users = await Candidate.find({ _id: { $in: usersList } });
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
          if (paidUnpaid === "") {
            const users = await UserBase.find({});
            return res
              .status(200)
              .json({ message: "success", data: users, type: type });
          }
        }
        if (type === "Payments") {
          if (paidUnpaid === "Paid") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              isApproved: true,
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }

                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
          if (paidUnpaid === "Unpaid") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }

                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
          if (paidUnpaid === "Pending") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              isApproved: false,
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }
                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
          if (paidUnpaid === "") {
            const fromdate = new Date(from);
            const todate = new Date(to);
            const payments = await Payment.find({
              approvalTimestamp: { $gte: fromdate, $lte: todate },
            });

            const enrichedPayments = await Promise.all(
              payments.map(async (payment) => {
                let percentageShare = null;

                if (payment.referenceCode) {
                  const admin = await UserBase.findOne({
                    referenceCode: payment.referenceCode,
                    __t: "admin",
                  });

                  if (admin) {
                    percentageShare = admin.percentageShare || null;
                  }
                }

                return {
                  ...payment.toObject(),
                  percentageShare,
                };
              })
            );
            return res
              .status(200)
              .json({ message: "success", data: enrichedPayments, type: type });
          }
        }
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

export default adminRoutes;
