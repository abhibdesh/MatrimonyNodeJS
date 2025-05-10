import express from "express";
import User from "../models/UserBase.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import mongoose from "mongoose";
import multer from "multer";
import { Readable } from "stream";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Candidate from "../models/User.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import PaymentBase from "../models/Payment.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import emailOTP from "../models/EmailOTPBase.js";
import phoneOTP from "../models/PhoneOTPBase.js";
dotenv.config();

const userRoutes = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

let gfsBucket;

export function setGridFSBucket(bucket) {
  gfsBucket = bucket;
}

const otpCache = {};
const WINDOW_SECONDS = 60 * 60; // 1 hour
const MAX_OTPS = 5;

userRoutes.post(
  "/update-my-profile",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        userEmail,
        phoneNumber,
        choosingFor,
        addressInShort,
        currentAddress,
        birthDate,
        birthTime,
        birthPlace,
        height,
        bloodGroup,
        disabilityYN,
        disablityDescription,
        degreeDiploma,
        degreeName,
        fieldJob,
        companyName,
        jobBusiness,
        incomeGroup,
        eatingHabits,
        raas,
        gotra,
        dosha,
        gana,
        devak,
        nakshatra,
        charan,
        naadi,
        familyType,
        siblingCount,
        educationOfSiblings,
        property,
        educationOfMother,
        educationOfFather,
        motherFamilyDetails,
        fatherFamilyDetails,
      } = req.body;
      const currentUser = req.user._id;
      if (req.user.__t === "candidate") {
        const user = await Candidate.findByIdAndUpdate(
          currentUser,
          {
            firstName: firstName,
            lastName: lastName,
            userEmail: userEmail,
            phoneNumber: phoneNumber,
            choosingFor: choosingFor,
            addressInShort: addressInShort,
            currentAddress: currentAddress,
            birthDate: birthDate,
            birthTime: birthTime,
            birthPlace: birthPlace,
            height: height,
            bloodGroup: bloodGroup,
            disabilityYN: disabilityYN,
            disablityDescription: disablityDescription,
            degreeDiploma: degreeDiploma,
            degreeName: degreeName,
            fieldJob: fieldJob,
            companyName: companyName,
            jobBusiness: jobBusiness,
            incomeGroup: incomeGroup,
            eatingHabits: eatingHabits,
            raas: raas,
            gotra: gotra,
            dosha: dosha,
            gana: gana,
            devak: devak,
            nakshatra: nakshatra,
            charan: charan,
            naadi: naadi,
            familyType: familyType,
            siblingCount: siblingCount,
            educationOfSiblings: educationOfSiblings,
            property: property,
            educationOfMother: educationOfMother,
            educationOfFather: educationOfFather,
            motherFamilyDetails: motherFamilyDetails,
            fatherFamilyDetails: fatherFamilyDetails,
          },
          {
            new: true,
          }
        );
        return res
          .status(200)
          .json({ message: "sucess", data: "Profile updated succesfully" });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to get preferences",
        });
      }

      // res.status(200).json({message:"sucess",data:"Profile updated sucessfully"})
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.get(
  "/get-preferences",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "candidate") {
        const user = await Candidate.findById(req.user._id, {
          expectedLocatities: 1,
          expectedEducations: 1,
          expectedIncome: 1,
          expectedEatingHabits: 1,
          expectedGana: 1,
          expectedNakshatra: 1,
          expectedAgeGapMin: 1,
          expectedAgeGapMax: 1,
          expectedBloodGroups: 1,
          expectedNaadi: 1,
          expectedRaas: 1,
          expectedHeight: 1,
          expectedFamilyType: 1,
          expectedSiblingsCousinsUpto: 1,
          profileWithImages: 1,
          strictMatch: 1,
        });
        return res.status(200).json({ message: "success", data: user });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to get preferences",
        });
      }
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/update-preferences",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const {
        expectedLocatities,
        expectedEducations,
        expectedIncome,
        expectedEatingHabits,
        expectedGana,
        expectedNakshatra,
        expectedAgeGapMin,
        expectedAgeGapMax,
        expectedBloodGroups,
        expectedNaadi,
        expectedRaas,
        expectedHeight,
        expectedFamilyType,
        expectedSiblingsCousinsUpto,
        profileWithImages,
        strictMatch,
      } = req.body;

      await Candidate.findByIdAndUpdate(req.user._id, {
        expectedLocatities: expectedLocatities,
        expectedEducations: expectedEducations,
        expectedIncome: expectedIncome,
        expectedEatingHabits: expectedEatingHabits,
        expectedGana: expectedGana,
        expectedNakshatra: expectedNakshatra,
        expectedAgeGapMin: expectedAgeGapMin,
        expectedAgeGapMax: expectedAgeGapMax,
        expectedBloodGroups: expectedBloodGroups,
        expectedNaadi: expectedNaadi,
        expectedRaas: expectedRaas,
        expectedHeight: expectedHeight,
        expectedFamilyType: expectedFamilyType,
        expectedSiblingsCousinsUpto: expectedSiblingsCousinsUpto,
        profileWithImages: profileWithImages,
        strictMatch: strictMatch,
      });
      return res.status(200).json({
        message: "success",
        data: "Your preferences are updated successfully",
      });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

async function paginateUsers(query, projection, pageNumber, rowsPerPage) {
  const totalCount = await Candidate.countDocuments(query);
  const users = await Candidate.find(query, projection)
    .skip((pageNumber - 1) * rowsPerPage)
    .limit(rowsPerPage);
  return { users, totalCount };
}

async function fetchUserImages(imageIds) {
  const filesCursor = mongoose.connection.db
    .collection("fs.files")
    .find({ _id: { $in: imageIds } });

  const files = await filesCursor.toArray();

  const chunksCursor = mongoose.connection.db
    .collection("fs.chunks")
    .find({ files_id: { $in: imageIds } })
    .sort({ n: 1 });

  const chunks = await chunksCursor.toArray();

  const fileChunksMap = files.reduce((acc, file) => {
    const fileChunk = chunks.filter((c) => c.files_id.equals(file._id));
    acc[file._id.toString()] = fileChunk.map((c) =>
      Buffer.from(c.data.buffer).toString("base64")
    );
    return acc;
  }, {});

  return { files, fileChunksMap };
}

function mapUsers(users, files, fileChunksMap) {
  return users.map((u) => {
    const fileId = u.image?.[0];
    const file = files.find((f) =>
      f._id.equals(new mongoose.Types.ObjectId(fileId))
    );

    const media = file
      ? [
          {
            fileId: file._id.toString(),
            filename: file.filename || "",
            contentType: file.contentType || "image/jpeg",
            length: file.length,
            chunks: fileChunksMap[file._id.toString()] || [],
          },
        ]
      : [];

    return {
      topData: {
        name: `${u.firstName} ${u.lastName}`,
        community: u.community,
        address: u.addressInShort,
        income:
          u.jobBusiness && u.incomeGroup
            ? `${u.jobBusiness}, earns ${u.incomeGroup}`
            : "NA",
        _id: u._id,
        isVerified: u.isVerified,
        profileImage: media,
        birthDate: u.birthDate,
        birthTime: u.birthTime,
        birthPlace: u.birthPlace,
      },
    };
  });
}

userRoutes.post(
  "/get-my-saved-profiles",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { rowsPerPage, pageNumber } = req.body;

      if (req.user.__t === "candidate") {
        const paymentData = await Payment.find(
          { userEmail: req.user.userEmail },
          { savedProfiles: 1, _id: 0 }
        );

        const currentUser = await User.findById(req.user._id);
        const projection = {
          firstName: 1,
          lastName: 1,
          birthDate: 1,
          birthTime: 1,
          birthPlace: 1,
          incomeGroup: 1,
          addressInShort: 1,
          community: 1,
          isVerified: 1,
          image: 1,
          __t: 1,
        };
        const userIdList = paymentData.flatMap(
          (entry) => entry.savedProfiles || []
        );

        let query = {
          _id: { $in: userIdList },
        };

        if (req.user.__t === "candidate") {
          query.lookingFor = { $ne: currentUser.lookingFor };
        }

        const { users, totalCount } = await paginateUsers(
          query,
          projection,
          pageNumber,
          rowsPerPage
        );

        const imageIds = users
          .map((u) => u.image?.[0])
          .filter(Boolean)
          .map((id) => new mongoose.Types.ObjectId(id));
        const { files, fileChunksMap } = await fetchUserImages(imageIds);
        const finalDataList = mapUsers(users, files, fileChunksMap);

        res.json({
          message: "Success",
          users: finalDataList,
          totalCount,
          currentPage: pageNumber,
          rowsPerPage,
        });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorized to fetch saved profiles",
        });
      }
    } catch (error) {
      console.log(error)
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/add-to-my-saved-profile",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "candidate") {
        const { userIdToAdd } = req.body;
        const getLastPayment = await PaymentBase.findOne({
          userEmail: req.user.userEmail,
        }).sort({ createdAt: -1 });
        const localTimezone = "Asia/Kolkata";
        const atm = moment().tz(localTimezone);
        if (getLastPayment.isApproved === true) {
          if (getLastPayment.validTill > atm) {
            if (getLastPayment.profileCount !== 0) {
              const count = getLastPayment.profileCount;
              if (getLastPayment.savedProfiles.length >= count) {
                return res.status(200).json({
                  message: "failure",
                  data: "You have exhausted your profile limit.",
                });
              } else {
                await Payment.updateOne(
                  { _id: getLastPayment._id },
                  {
                    $addToSet: { savedProfiles: userIdToAdd },
                    $inc: { totalProfilesViewed: 1 },
                  }
                );
                return res.status(200).json({
                  message: "success",
                  data: "Profile added successfully",
                });
              }
            } else {
              await Payment.updateOne(
                { _id: getLastPayment._id },
                {
                  $addToSet: { savedProfiles: userIdToAdd },
                  $inc: { totalProfilesViewed: 1 },
                }
              );
              return res.status(200).json({
                message: "success",
                data: "Profile added successfully",
              });
            }
          }

          return res.status(200).json({
            message: "failure",
            data: "Your plan has expired.Please check the validity.",
          });
        } else {
          return res.status(200).json({
            message: "failure",
            data: "Your payment is still under review",
          });
        }
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to save profiles",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/deactivate-account",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (req.user.__t !== "candidate") {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to deactivate user profiles",
        });
      } else {
        const data = await Candidate.findByIdAndUpdate(req.user._id, {
          isActive: false,
          deactivationReason: reason,
        });
        return res.status(200).json({
          message: "success",
          data: "Account Deactivated Successfully",
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/verfiy-email-send-otp",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { userName } = req.body;
      let otp = "";
      const characters = "1234567890";
      for (let i = 0; i < 6; i++) {
        const randomInd = Math.floor(Math.random() * characters.length);
        otp += characters.charAt(randomInd);
      }
      await emailOTP.create({
        OTP: otp,
        userId: req.user._id,
      });
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
        to: req.user.userEmail,
        bcc: "vickys2962@gmail.com;abhibdesh@gmail.com",
        subject: "Email Verification",
        html: `
              <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f5f7fa;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 30px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            padding: 30px;
          }
          .header {
            text-align: center;
            background-color: #e68a9e;
            padding: 20px;
            font-size: 24px;
          }
          .content {
            padding: 20px;
            font-size: 16px;
            color: #333333;
            line-height: 1.6;
          }
          .otp-box {
            display: inline-block;
            background-color:rgb(252, 237, 255);
            border: 1px dashed #e68a9e;
            font-size: 24px;
            font-weight: bold;
            padding: 12px 24px;
            margin: 20px 0;
            border-radius: 6px;
            letter-spacing: 4px;
          }
          .footer {
            text-align: center;
            font-size: 13px;
            color: #888888;
            margin-top: 30px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">Verify Your Email</div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Thank you for signing up! Please use the following One-Time Password (OTP) to verify your email address:</p>
            <div class="otp-box">${otp}</div>
            <p>This OTP is valid for the next 30 minutes. Please do not share it with anyone.</p>
            <p>If you did not request this, please ignore this email.</p>
            <p>Best regards,<br />Team Fyjix</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Suta Bandhan By Fyjix. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `,
      };
      transporter
        .sendMail(mailOptions)
        .then((info) => console.log("Email sent:", info.response))
        .catch((error) => console.error("Error sending email:", error));
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/verify-email",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { otp } = req.body;
      const ObjectId = mongoose.Types.ObjectId;
      const lastOTPForUser = await emailOTP
        .findOne({ userId: new ObjectId(req.user._id), isUsed: false })
        .sort({ createdAt: -1 });
      if (!lastOTPForUser) {
        return res.status(404).json({ message: "No OTP found." });
      }
      const now = new Date();
      const otpCreatedAt = lastOTPForUser.createdAt;

      if (now - otpCreatedAt > 30 * 60 * 1000) {
        return res.status(200).json({
          message: "failure",
          data: "OTP is expired. Please request a new OTP to proceed further.",
        });
      }

      if (otp === lastOTPForUser.OTP) {
        await Candidate.findByIdAndUpdate(req.user._id, {
          $set: {
            isEmailVerified: true,
          },
        });
        await emailOTP.findOneAndUpdate(lastOTPForUser._id, {
          $set: {
            isUsed: true,
          },
        });
        return res
          .status(200)
          .json({ message: "success", data: "Email Verified Successfully" });
      } else {
        return res
          .status(200)
          .json({ message: "failure", data: "Invalid OTP" });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.get("/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  console.log("webhook 1");
  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    console.log("webhook 1.1");
    console.log("Webhook Verified");
    return res.status(200).send(challenge);
  }
  console.log("webhook 2");

  res.sendStatus(403);
});

userRoutes.post(
  "/webhook",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    console.log("Webhook POST");
    const data = req.body;

    if (data.object === "whatsapp_business_account") {
      for (const entry of data.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value || {};
          const messages = value.messages || [];

          for (const message of messages) {
            const userNumber = message.from;
            const messageBody = message.text?.body?.trim().toLowerCase();

            if (messageBody && messageBody.includes("verify")) {
              if (canSendOtp(userNumber)) {
                let otp = "";
                const characters = "0123456789";
                for (let i = 0; i < 6; i++) {
                  const randomInd = Math.floor(
                    Math.random() * characters.length
                  );
                  otp += characters.charAt(randomInd);
                }
                await sendOtpToUser(userNumber, otp, req.user._id);
              } else {
                console.log(`Rate limit hit for ${userNumber}`);
              }
            }
          }
        }
      }
    }
    res.sendStatus(200);
  }
);

async function sendOtpToUser(phone, otp, userId) {
  console.log("sendOtpToUser");

  const url = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`;

  const headers = {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };

  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: {
      body: `Your OTP is: ${otp}. This OTP is valid for 1 hour. Do not share this with anyone.`,
    },
  });
  console.log(body)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    const data = await response.json();
    console.log("Meta API response:", response.status, data);

    if (response.ok) {

      await saveOtp(phone, otp, userId);
    } else {
      console.error("Failed to send OTP:", data);
    }
  } catch (err) {
    console.error("Error sending OTP:", err);
  }
}

async function saveOtp(phone, otp, userId) {
  await phoneOTP.create({
    userId: userId,
    OTP: otp,
  });

  console.log(`Saved OTP ${otp} for ${phone}`);
}

function canSendOtp(phone) {
  const now = Date.now() / 1000;
  otpCache[phone] = (otpCache[phone] || []).filter(
    (t) => now - t < WINDOW_SECONDS
  );

  if (otpCache[phone].length < MAX_OTPS) {
    otpCache[phone].push(now);
    return true;
  }
  return false;
}

userRoutes.post(
  "/verify-phone",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { otp } = req.body;
      const ObjectId = mongoose.Types.ObjectId;
      const lastOTPForUser = await phoneOTP
        .findOne({ userId: new ObjectId(req.user._id), isUsed: false })
        .sort({ createdAt: -1 });
      if (!lastOTPForUser) {
        return res.status(404).json({ message: "No OTP found." });
      }
      const now = new Date();
      const otpCreatedAt = lastOTPForUser.createdAt;

      if (now - otpCreatedAt > 30 * 60 * 1000) {
        return res.status(200).json({
          message: "failure",
          data: "OTP is expired. Please request a new OTP to proceed further.",
        });
      }

      if (otp === lastOTPForUser.OTP) {
        await Candidate.findByIdAndUpdate(req.user._id, {
          $set: {
            isPhoneVerified: true,
          },
        });
        await phoneOTP.findOneAndUpdate(lastOTPForUser._id, {
          $set: {
            isUsed: true,
          },
        });
        return res
          .status(200)
          .json({ message: "success", data: "Phone Verified Successfully" });
      } else {
        return res
          .status(200)
          .json({ message: "failure", data: "Invalid OTP" });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.get(
  "/get-images",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const userId = req.user._id;
      // 1. Get all files uploaded by this user
      const files = await mongoose.connection.db
        .collection("fs.files")
        .find({ "metadata.uploadedBy": userId })
        .toArray();

      // 2. For each file, fetch its chunks
      const media = await Promise.all(
        files.map(async (file) => {
          const chunks = await mongoose.connection.db
            .collection("fs.chunks")
            .find({ files_id: file._id })
            .sort({ n: 1 })
            .project({ data: 1 })
            .toArray();

          return {
            fileId: file._id,
            filename: file.filename,
            contentType: file.contentType,
            length: file.length,
            chunks: chunks.map((c) => c.data),
          };
        })
      );

      res.status(200).json({ media });
    } catch (error) {
      console.log(error);
      res.json({ message: "failure" });
    }
  }
);

userRoutes.post(
  "/upload-image",
  authMiddleware,
  updateLastActivity,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user._id;
      const user = await Candidate.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.images.length >= 3) {
        return res.status(400).json({
          message: "failure",
          data: "Only three images are allowed. Kindly delete existing image/images to upload new.",
        });
      }

      const { buffer, originalname, mimetype } = req.file;
      const fileStream = new Readable();
      fileStream.push(buffer);
      fileStream.push(null);

      const uploadStream = gfsBucket.openUploadStream(originalname, {
        contentType: mimetype,
        metadata: {
          uploadedBy: userId,
          uploadedAt: new Date(),
        },
      });

      fileStream
        .pipe(uploadStream)
        .on("error", (error) => {
          console.error("Upload Error:", error);
          res.status(500).json({ message: "Upload Error", error });
        })
        .on("finish", async () => {
          user.images.push(uploadStream.id);
          await user.save();
          res.status(200).json({
            message: "success",
            fileId: uploadStream.id,
            data: "Image uploaded successfully",
          });
        });
    } catch (error) {
      console.error("Upload Handler Error:", error);
      res.status(500).json({ message: "failure", data: error.message });
    }
  }
);


userRoutes.post(
  "/set-profile-image",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { imageId } = req.body;
      await Candidate.findByIdAndUpdate(req.user._id, { $set: { image: [] } });
      await Candidate.findByIdAndUpdate(req.user._id, {
        $set: { image: [imageId] },
      });
      return res.status(200).json({
        message: "success",
        data: "Profile picture changed successfully",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

export default userRoutes;
