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
dotenv.config();

const userRoutes = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

let gfsBucket;

export function setGridFSBucket(bucket) {
  gfsBucket = bucket;
}

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
        return res
          .status(401)
          .json({
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
        return res
          .status(401)
          .json({
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
      return res
        .status(200)
        .json({
          message: "success",
          data: "Your preferences are updated successfully",
        });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

userRoutes.post(
  "/get-my-saved-profiles",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      if (req.user.__t === "candidate") {
        const paymentData = await Payment.find(
          { userEmail: req.user.userEmail },
          { savedProfiles: 1, _id: 0 }
        );

        const userIdList = paymentData
          .flatMap((entry) => entry.savedProfiles || [])
          .filter(Boolean)
          .map((id) => new mongoose.Types.ObjectId(id));

        const profileData = await Candidate.find({ _id: { $in: userIdList } });

        return res.status(200).json({ message: "success", data: profileData });
      } else {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorized to fetch saved profiles",
        });
      }
    } catch (error) {
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
              const count = getLastPayment.profileCount.toInt32();
              if (length(getLastPayment.savedProfiles) >= count) {
                return res
                  .status(200)
                  .json({
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
                return res
                  .status(200)
                  .json({
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
              return res
                .status(200)
                .json({
                  message: "success",
                  data: "Profile added successfully",
                });
            }
          }

          return res
            .status(200)
            .json({
              message: "failure",
              data: "Your plan has expired.Please check the validity.",
            });
        } else {
          return res
            .status(200)
            .json({
              message: "failure",
              data: "Your payment is still under review",
            });
        }
      } else {
        return res
          .status(401)
          .json({
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
        return res
          .status(401)
          .json({
            message: "failure",
            data: "You are unauthorised to deactivate user profiles",
          });
      } else {
        const data = await Candidate.findByIdAndUpdate(req.user._id, {
          isActive: false,
          deactivationReason: reason,
        });
        return res
          .status(200)
          .json({
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
      const characters =
        "1234567890";
      for (let i = 0; i < 6; i++) {
        const randomInd = Math.floor(Math.random() * characters.length);
        otp += characters.charAt(randomInd);
      }
      await emailOTP.create({
        OTP : otp,
        userId : req.user._id
      })
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.GMAIL_USER,
        // to: req.user.userEmail,
        to: "abhi10900@gmail.com",
        // to: "vickys2962@gmail.com",
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

userRoutes.post("/verify-email",authMiddleware,updateLastActivity,async(req,res)=>{
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
      return res
        .status(200)
        .json({ message: "failure", data:"OTP is expired. Please request a new OTP to proceed further."});
    }

    if(otp === lastOTPForUser.OTP){
      await Candidate.findByIdAndUpdate(req.user._id,{
        $set:{
          isEmailVerified : true
        }
      })
      await emailOTP.findOneAndUpdate(lastOTPForUser._id,{
        $set:{
          isUsed:true
        }
      })
      return res
      .status(200)
      .json({ message: "success", data: "Email Verified Successfully" });
    }
    else{
      return res
      .status(200)
      .json({ message: "failure", data: "Invalid OTP" });
    }
   
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

export default userRoutes;
