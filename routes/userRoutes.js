import express from "express";
import User from "../models/UserBase.js";
import authMiddleware from "../middleware/auth.js";
import mongoose from "mongoose";
import multer from "multer";
import { Readable } from "stream";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Candidate from "../models/User.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import PaymentBase from "../models/Payment.js";
import dotenv from "dotenv";
import emailOTP from "../models/EmailOTPBase.js";
import phoneOTP from "../models/PhoneOTPBase.js";
import UserBase from "../models/UserBase.js";
import { body, validationResult } from "express-validator";

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

async function sendOtpToUser(phone, otp) {
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
  console.log(body);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    const data = await response.json();
    console.log("Meta API response:", response.status, data);

    if (response.ok) {
      await saveOtp(phone, otp);
    } else {
      console.error("Failed to send OTP:", data);
    }
  } catch (err) {
    console.error("Error sending OTP:", err);
  }
}

async function saveOtp(phone, otp) {
  await phoneOTP.create({
    phoneNumber: phone,
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
  "/update-my-profile",
  [
    body("firstName")
      .trim()
      .notEmpty()
      .withMessage("First name is required")
      .matches(/^[A-Za-z\s]+$/)
      .withMessage("First name can only contain letters and spaces"),
    body("lastName")
      .trim()
      .notEmpty()
      .withMessage("Last name is required")
      .matches(/^[A-Za-z\s]+$/)
      .withMessage("Last name can only contain letters and spaces"),
    body("userEmail")
      .notEmpty()
      .withMessage("Email is mandatory")
      .isEmail()
      .withMessage("Please enter a valid email id"),
    body("phoneNumber")
      .notEmpty()
      .withMessage("Phone number is mandatory")
      .isMobilePhone()
      .withMessage("Please enter a valid Phone Number"),
    body("currentAddress")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("No special characters are allowed in address"),
    body("height")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .isFloat()
      .withMessage("Invalid height format. eg: 5.6"),
    body("degreeName")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Invalid Degree Name. eg: BE. IT"),
    body("fieldJob")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Invalid Field/Job Name. eg: Project Manager"),
    body("companyName")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Special Characters are not allowed in Company Name"),
    body("gotra")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Special Characters are not allowed in Gotra"),
    body("dosha")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Special Characters are not allowed in Dosha"),
    body("devak")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Special Characters are not allowed in Devak"),
    body("charan")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .isNumeric()
      .withMessage("Charan should be a number"),
    body("siblingCount")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .isNumeric()
      .withMessage("Sibling count should be a number"),
    body("educationOfSiblings")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Details of siblings should not have special characters"),
    body("property")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Property should not have special characters"),
    body("educationOfMother")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Education of mother should not have special characters"),
    body("educationOfFather")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Education of Father should not have special characters"),
    body("motherFamilyDetails")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Mother Family details should not have special characters"),
    body("fatherFamilyDetails")
      .optional({ checkFalsy: true }) // allows "", null, undefined
      .matches(/^[A-Za-z0-9,\.\-\/&\s\n\r\t]+$/)
      .withMessage("Father Family details should not have special characters"),
  ],
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ message: "validation_error", errors: errors.array() });
      }
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
      console.log(error);
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
      console.log(error);
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

      let fromDate = null;
      let toDate = null;

      // Convert year to full date range if numeric
      if (!isNaN(Number(expectedAgeGapMin))) {
        fromDate = new Date(`${expectedAgeGapMin}-01-01T00:00:00.000Z`);
      }

      if (!isNaN(Number(expectedAgeGapMax))) {
        toDate = new Date(`${expectedAgeGapMax}-12-31T23:59:59.999Z`);
      }

      // Dynamically build update object
      const updateObj = {
        expectedLocatities,
        expectedEducations,
        expectedIncome,
        expectedEatingHabits,
        expectedGana,
        expectedNakshatra,
        expectedBloodGroups,
        expectedNaadi,
        expectedRaas,
        expectedHeight,
        expectedFamilyType,
        expectedSiblingsCousinsUpto,
        profileWithImages,
        strictMatch,
      };

      // Only add valid dates to update object
      if (!isNaN(fromDate?.getTime())) {
        updateObj.expectedAgeGapMin = fromDate;
      }

      if (!isNaN(toDate?.getTime())) {
        updateObj.expectedAgeGapMax = toDate;
      }

      // Optional: log what's being updated
      // console.log("Updating preferences:", updateObj);

      await Candidate.findByIdAndUpdate(req.user._id, updateObj);

      return res.status(200).json({
        message: "success",
        data: "Your preferences are updated successfully",
      });
    } catch (error) {
      console.error("Update Preferences Error:", error);
      return res.status(500).json({
        message: "failure",
        data: error.message,
      });
    }
  }
);

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
      console.log(error);
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
                // await User.updateOne({_id:userIdToAdd},{$addToSet: { savedMe: req.user._id }})
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
              // await User.updateOne({_id:userIdToAdd},{$addToSet: { savedMe: req.user._id }})
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
  res.sendStatus(403);
});

userRoutes.post("/webhook", async (req, res) => {
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
                const randomInd = Math.floor(Math.random() * characters.length);
                otp += characters.charAt(randomInd);
              }
              await sendOtpToUser(userNumber, otp);
            } else {
              console.log(`Rate limit hit for ${userNumber}`);
            }
          }
        }
      }
    }
  }
  res.sendStatus(200);
});

userRoutes.post(
  "/verify-phone",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { otp } = req.body;
      const candidate = await Candidate.findById(req.user._id);
      const lastOTPForUser = await phoneOTP
        .findOne({
          phoneNumber: Number("91" + candidate.phoneNumber.toString()),
          isUsed: false,
        })
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
          console.error(error);
          res.status(500).json({ message: "failure", data: error.message });
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
      console.error(error);
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

userRoutes.post(
  "/delete-image",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { imageId } = req.body;

      if (!imageId) {
        return res.status(400).json({
          message: "failure",
          data: "Image ID is required",
        });
      }

      // Convert string ID to ObjectId
      const fileObjectId = new mongoose.Types.ObjectId(imageId);

      // Remove file reference from user profile
      await Candidate.findByIdAndUpdate(req.user._id, {
        $pull: { image: imageId }, // use correct array field name
      });

      // Delete file from GridFS
      const db = mongoose.connection.db;

      const fileDeleteResult = await db.collection("fs.files").deleteOne({
        _id: fileObjectId,
      });

      const chunkDeleteResult = await db.collection("fs.chunks").deleteMany({
        files_id: fileObjectId,
      });

      return res.status(200).json({
        message: "success",
        data: {
          fileDeleted: fileDeleteResult.deletedCount,
          chunksDeleted: chunkDeleteResult.deletedCount,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "failure",
        data: error.message,
      });
    }
  }
);

userRoutes.get(
  "/get-profile-image",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const user = await UserBase.findById(req.user._id);
      const files = user.image || [];
      const media = await Promise.all(
        files.map(async (fileId) => {
          const chunks = await mongoose.connection.db
            .collection("fs.chunks")
            .find({ files_id: new mongoose.Types.ObjectId(fileId) })
            .sort({ n: 1 })
            .project({ data: 1 })
            .toArray();

          const joined = chunks.map((c) => c.data.toString("base64")).join("");

          const fileDoc = await mongoose.connection.db
            .collection("fs.files")
            .findOne({ _id: new mongoose.Types.ObjectId(fileId) });

          return {
            fileId,
            filename: fileDoc.filename,
            contentType: fileDoc.contentType,
            length: fileDoc.length,
            base64: joined,
          };
        })
      );
      return res.status(200).json({
        message: "success",
        media: media,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "failure",
        data: error.message,
      });
    }
  }
);

// userRoutes.post(
//   "/get-saved-by-candidates",
//   authMiddleware,
//   updateLastActivity,
//   async (req, res) => {
//     try {
//       const { filters, rowsPerPage, pageNumber } = req.body;
//       console.log("pageNumber");
//       console.log(pageNumber);
//       const currentUser = await UserBase.findById(req.user._id);
//       const projection = {
//         firstName: 1,
//         lastName: 1,
//         birthDate: 1,
//         birthTime: 1,
//         birthPlace: 1,
//         incomeGroup: 1,
//         addressInShort: 1,
//         community: 1,
//         isVerified: 1,
//         image: 1,
//         __t: 1,
//       };

//       let query = {
//         _id: { $ne: currentUser._id, $in:[currentUser.savedMe] },
//         isDeleted: false,
//         isActive: true,
//       };

//       if (filters.expectedAgeGapMin !== null) {
//         const fromDate = new Date(
//           `${filters.expectedAgeGapMin}-01-01T00:00:00.000Z`
//         );
//         query.birthDate = { $gte: fromDate };
//       }
//       if (filters.expectedAgeGapMax !== null) {
//         const toDate = new Date(
//           `${filters.expectedAgeGapMax}-12-31T23:59:59.999Z`
//         );
//         query.birthDate = { $lte: toDate };
//       }

//       query.isVerified = true;
//       query.isEmailVerified = true;
//       query.isPhoneVerified = true;

//       if (req.user.__t === "candidate") {
//         applyFilters(query, filters, currentUser);
//         query.lookingFor = { $ne: currentUser.lookingFor };
//         query.__t = "candidate";
//         query.community = { $eq: currentUser.community, $ne: "" };
//         query.$or = [
//           {
//             $expr: {
//               $and: [
//                 {
//                   $gte: [
//                     {
//                       $convert: {
//                         input: "$height",
//                         to: "double",
//                         onError: 0, // fallback value on conversion error
//                         onNull: 0, // fallback value when field is null
//                       },
//                     },
//                     parseFloat(filters.selectedFromHeight),
//                   ],
//                 },
//                 {
//                   $lte: [
//                     {
//                       $convert: {
//                         input: "$height",
//                         to: "double",
//                         onError: 0,
//                         onNull: 0,
//                       },
//                     },
//                     parseFloat(filters.selectedToHeight),
//                   ],
//                 },
//               ],
//             },
//           },
//           { height: "" },
//         ];
//       } else if (req.user.__t === "admin") {
//         const admin = await Admin.findById(req.user._id);
//         applyFilters(query, filters, currentUser);
//         query.referenceCode = admin.referenceCode;
//         query.__t = "candidate";
//         query.isVerified = true;
//         delete query.height;
//       } else if (req.user.__t === "owner") {
//         delete query.__t;
//         delete query.lookingFor;
//       }
//       console.log("filters");
//       console.log(filters);
//       console.log("query");
//       console.log(query);
//       const { users, totalCount } = await paginateUsers(
//         query,
//         projection,
//         pageNumber,
//         rowsPerPage
//       );

//       const imageIds = users
//         .map((u) => u.image?.[0])
//         .filter(Boolean)
//         .map((id) => new mongoose.Types.ObjectId(id));
//       const { files, fileChunksMap } = await fetchUserImages(imageIds);
//       const finalDataList = mapUsers(users, files, fileChunksMap);

//       res.json({
//         message: "Success",
//         users: finalDataList,
//         totalCount,
//         currentPage: pageNumber,
//         rowsPerPage,
//         userRole: req.user.__t,
//       });
//     } catch (error) {
//       console.log(error);
//       res.status(500).json({ message: "failure", data: error.message });
//     }
//   }
// );

// async function paginateUsers(query, projection, pageNumber, rowsPerPage) {
//   const totalCount = await UserBase.countDocuments(query);
//   const users = await UserBase.find(query, projection)
//     .skip((pageNumber - 1) * rowsPerPage)
//     .limit(rowsPerPage);
//   return { users, totalCount };
// }

// function applyFilters(query, filters = {}, currentUser = {}) {
//   const toArray = (val) => (Array.isArray(val) ? val : []);

//   const mergeOrAddExpected = (filterKey, expectedKey) => {
//     const filterVals = toArray(filters?.[filterKey]);
//     const expectedVals = toArray(currentUser?.[expectedKey]);

//     // Merge and deduplicate
//     const mergedVals = [...new Set([...filterVals, ...expectedVals])];
//     return mergedVals;
//   };

//   const mapFilters = [
//     ["selectedEducations", "selectedEducations", "expectedEducations"],
//     ["addressInShort", "selectedLocatities", "expectedLocatities"],
//     ["incomeGroup", "selectedIncome", "expectedIncome"],
//     ["eatingHabits", "expectedEatingHabits", "expectedEatingHabits"],
//     ["gana", "expectedGana", "expectedGana"],
//     ["nakshatra", "expectedNakshatra", "expectedNakshatra"],
//     ["bloodGroup", "expectedBloodGroups", "expectedBloodGroups"],
//     ["naadi", "expectedNaadi", "expectedNaadi"],
//     ["raas", "expectedRaas", "expectedRaas"],
//     ["familyType", "expectedFamilyType", "expectedFamilyType"],
//     [
//       "selectedSiblingsCousinsUpto",
//       "selectedSiblingsCousinsUpto",
//       "expectedSiblingsCousinsUpto",
//     ],
//     ["profileWithImages", "profileWithImages", "profileWithImages"],
//   ];

//   for (const [field, filterKey, expectedKey] of mapFilters) {
//     const vals = mergeOrAddExpected(filterKey, expectedKey);
//     if (vals.length > 0) {
//       query[field] = { $in: vals };
//     }
//   }
// }

// function mapUsers(users, files, fileChunksMap) {
//   return users.map((u) => {
//     const fileId = u.image?.[0];
//     const file = files.find((f) =>
//       f._id.equals(new mongoose.Types.ObjectId(fileId))
//     );

//     const media = file
//       ? [
//           {
//             fileId: file._id.toString(),
//             filename: file.filename || "",
//             contentType: file.contentType || "image/jpeg",
//             length: file.length,
//             chunks: fileChunksMap[file._id.toString()] || [],
//           },
//         ]
//       : [];

//     return {
//       topData: {
//         name: `${u.firstName} ${u.lastName}`,
//         community: u.community,
//         address: u.addressInShort,
//         income:
//           u.jobBusiness && u.incomeGroup
//             ? `${u.jobBusiness}, earns ${u.incomeGroup}`
//             : "NA",
//         _id: u._id,
//         isVerified: u.isVerified,
//         profileImage: media,
//         birthDate: u.birthDate,
//         birthTime: u.birthTime,
//         birthPlace: u.birthPlace,
//       },
//     };
//   });
// }

// async function fetchUserImages(imageIds) {
//   const filesCursor = mongoose.connection.db
//     .collection("fs.files")
//     .find({ _id: { $in: imageIds } });

//   const files = await filesCursor.toArray();

//   const chunksCursor = mongoose.connection.db
//     .collection("fs.chunks")
//     .find({ files_id: { $in: imageIds } })
//     .sort({ n: 1 });

//   const chunks = await chunksCursor.toArray();

//   const fileChunksMap = files.reduce((acc, file) => {
//     const fileChunk = chunks.filter((c) => c.files_id.equals(file._id));
//     acc[file._id.toString()] = fileChunk.map((c) =>
//       Buffer.from(c.data.buffer).toString("base64")
//     );
//     return acc;
//   }, {});

//   return { files, fileChunksMap };
// }

export default userRoutes;
