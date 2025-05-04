import express from "express";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import Admin from "../models/AdminBase.js";
import MenuMaster from "../models/MenuMaster.js";
import DistrictMaster from "../models/DistrictsBase.js";
import PaymentBase from "../models/Payment.js";
import moment from "moment-timezone";
import dotenv from "dotenv";
dotenv.config();

const commonRoutes = express.Router();

commonRoutes.post("/user-login", async (req, res) => {
  try {
    const { userEmail, userPassword } = req.body;
    const user = await UserBase.findOne({ userEmail });

    if (!user) {
      return res
        .status(404)
        .json({ message: "failure", data: "User Not Found" });
    }

    const isMatch = await bcrypt.compare(userPassword, user.userPassword);
    if (!isMatch) {
      return res
        .status(200)
        .json({ message: "failure", data: "Invalid credentials" });
    }

    const payload = {
      _id: user._id,
      userEmail: user.userEmail,
      __t: user.__t,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    await UserBase.findByIdAndUpdate(user._id, { accessToken: token });

    res.cookie("token", token, {
      httpOnly: true, // Prevent access from JavaScript (security)
      // secure: true,    // Use HTTPS (for production)
      // sameSite: "None", // Prevent CSRF attacks
      sameSite: "Lax", // For localhost
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "success",
      data: "User logged in successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

commonRoutes.get(
  "/get-menu-master",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const menu = await MenuMaster.find(
        { __t: req.user.__t },
        { _id: 0, displayName: 1, path: 1, priority: 1 }
      ).sort({ priority: 1 });
      res.status(200).json({
        message: "success",
        data: menu,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: error.message });
    }
  }
);

// TODO: Need to work on filters and add preferences
commonRoutes.post(
  "/get-all-users",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { filters, rowsPerPage, pageNumber } = req.body;
      const currentUser = req.user._id;
      if (req.user.__t === "candidate") {
        const candidate = await Candidate.findById(currentUser);
        const updatedFilter = filters;
        updatedFilter.__t = "candidate";
        updatedFilter.lookingFor =
          candidate.lookingFor === "Bride" ? "Groom" : "Bride";
        updatedFilter.community = candidate.community;
        const totalCount = await Candidate.countDocuments(updatedFilter);
        const users = await Candidate.find(updatedFilter, {
          _id: 1,
          firstName: 1,
          lastName: 1,
          birthDate: 1,
          birthTime: 1,
          birthPlace: 1,
          incomeGroup: 1,
          addressInShort: 1,
          community: 1,
          isVerified: 1,
        })
          .skip((pageNumber - 1) * rowsPerPage)
          .limit(rowsPerPage);
        res
          .status(200)
          .json({ message: "success", data: users, totalCount: totalCount });
      }
      if (req.user.__t === "admin") {
        const admin = await Admin.findById(req.user._id);
        const updatedFilter = filters;
        updatedFilter.__t = "candidate";
        updatedFilter.referenceCode = admin.referenceCode;
        const totalCount = await Candidate.countDocuments(updatedFilter);
        const users = await Candidate.find(updatedFilter, {
          _id: 1,
          firstName: 1,
          lastName: 1,
          birthDate: 1,
          birthTime: 1,
          birthPlace: 1,
          incomeGroup: 1,
          addressInShort: 1,
          community: 1,
          isVerified: 1,
        })
          .skip((pageNumber - 1) * rowsPerPage)
          .limit(rowsPerPage);
        return res
          .status(200)
          .json({ message: "success", data: users, totalCount: totalCount });
      }
      if (req.user.__t === "owner") {
        const totalCount = await Candidate.countDocuments();
        const users = await UserBase.find(
          { _id: { $ne: currentUser } },
          {
            _id: 1,
            firstName: 1,
            lastName: 1,
            birthDate: 1,
            birthTime: 1,
            birthPlace: 1,
            incomeGroup: 1,
            addressInShort: 1,
            isVerified: 1,
          }
        )
          .skip((pageNumber - 1) * rowsPerPage)
          .limit(rowsPerPage);
        return res
          .status(200)
          .json({ message: "success", data: users, totalCount: totalCount });
      }
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

commonRoutes.get(
  "/get-my-profile",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const user = await UserBase.findById(req.user._id, {
        userPassword: 0,
        accessToken: 0,
      });
      user.userRole = req.user.__t;
      return res.status(200).json({ message: "success", data: user });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.get(
  "/home/get-profile-by-id/:userId",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const data = await UserBase.findById(userId, {
        lastActivity: 0,
        createdAt: 0,
        updatedAt: 0,
        __t: 0,
        isDeleted: 0,
        isActive: 0,
        isLoggedIn: 0,
        lastLogoutTime: 0,
        userPassword: 0,
        __v: 0,
        accessToken: 0,
      }).lean();
      const finalData = {};
      const paymentInfo = await PaymentBase.findOne({
        userEmail: req.user.userEmail,
      }).sort({ createdAt: -1 });

      const paymentInfoForProfiles = await PaymentBase.find({
        userEmail: req.user.userEmail,
      });

      const userIdList = paymentInfoForProfiles
        .flatMap((entry) => entry.savedProfiles || [])
        .filter(Boolean)
        .map((id) => id);

      let dayName = "";
      if (data.birthDate) {
        dayName = moment(data.birthDate).format("dddd");
      }
      finalData.image = data.image || "";
      finalData.name = `${data.firstName} ${data.lastName}`;

      let paymentPlan = "None";
      finalData.isAlreadyAdded = false;
      if (paymentInfo) {
        if (userIdList.includes(data._id.toString())) {
          finalData.isAlreadyAdded = true;
        }
        const localTimezone = "Asia/Kolkata";
        const atm = moment().tz(localTimezone);
        if (
          paymentInfo.isApproved === true &&
          (paymentInfo.profileCount == 0 ||
            paymentInfo.savedProfiles.length <
              paymentInfo.profileCount <
              parseInt(paymentInfo.profileCount)) &&
          moment.utc(paymentInfo.validTill).isAfter(atm.utc())
        ) {
          paymentPlan = "Active";
        }
      }
      // Reference Name
      if (data.referenceCode) {
        const adminData = await UserBase.findOne({
          __t: "admin",
          referenceCode: data.referenceCode,
        });
        finalData.referenceName = `${adminData.firstName} ${adminData.lastName}`;
      } else {
        finalData.referenceName = "NA";
      }

      // Other fields
      finalData.jobBusiness = data.jobBusiness || "Not Provided";
      finalData.degreeDiploma = data.degreeDiploma || "Not Provided";
      finalData.fieldJob = data.fieldJob || "Not Provided";
      finalData.degreeName = data.degreeName || "Not Provided";
      finalData.companyName = data.companyName || "Not Provided";
      finalData.incomeGroup = data.incomeGroup || "Not Provided";
      finalData.currentAddress = data.currentAddress || "Not Provided";
      finalData.fullAddress =
        `${data.currentAddress}, ${data.addressInShort}` || "Not Provided";

      // Birth Date and Time Section
      if (data.birthDate) {
        const birthDate = moment(data.birthDate).format("DD MMMM YYYY");
        dayName = moment(data.birthDate).format("dddd");
        finalData.birthDate = `${birthDate}, ${dayName}`;
      } else {
        finalData.birthDate = "Not Provided";
      }

      if (data.birthTime) {
        const formattedTime = moment(data.birthTime, "HH:mm:ss").format(
          "hh:mm A"
        );
        finalData.birthTime = formattedTime;
      } else {
        finalData.birthTime = "Not Provided";
      }

      finalData.birthPlace = data.birthPlace || "Not Provided";
      finalData.height = data.height ? `${data.height} Feet` : "Not Provided";
      finalData.bloodGroup = data.bloodGroup || "Not Provided";
      finalData.disabilityYN = data.disabilityYN || "Not Applicable";

      // Expectations Section
      finalData.selectedEducations = data.selectedEducations || "No bar";
      finalData.selectedIncome = data.selectedIncome || "No bar";
      finalData.expectedEatingHabits = data.expectedEatingHabits || "No bar";
      finalData.expectedGana = data.expectedGana || "No bar";
      finalData.expectedLocality = data.expectedLocality || "No bar";
      finalData.expectedNakshatra = data.expectedNakshatra || "No bar";
      finalData.expectedBloodGroups = data.expectedBloodGroups || "No bar";
      finalData.expectedNaadi = data.expectedNaadi || "No bar";
      finalData.expectedRaas = data.expectedRaas || "No bar";
      finalData.expectedHeight = data.expectedHeight || "No bar";
      finalData.expectedFamilyType = data.expectedFamilyType;
      finalData.selectedSiblingsCousinsUpto =
        data.selectedSiblingsCousinsUpto || "No bar";
      finalData.expectedAgeGap =
        `${data.expectedAgeGapMin}-${data.expectedAgeGapMax} years` || "No bar";
      finalData.expectedAgeGapMax = data.expectedAgeGapMax
        ? `${data.expectedAgeGapMax} years`
        : "No bar";
      finalData.expectedAgeGapMin = data.expectedAgeGapMin
        ? `${data.expectedAgeGapMin} years`
        : "No bar";
      finalData.strictMatch = data.strictMatch ? "Yes" : "No";
      finalData.isVerified = data.isVerified;
      finalData.paymentplan = paymentPlan;
      return res.status(200).json({ message: "success", data: finalData });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.get(
  "/saved-profiles/get-profile-by-id/:userId",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { userId } = req.params;
      if (req.user.__t) {
        const data = await UserBase.findById(userId, {
          lastActivity: 0,
          createdAt: 0,
          updatedAt: 0,
          __t: 0,
          isDeleted: 0,
          isActive: 0,
          isLoggedIn: 0,
          lastLogoutTime: 0,
          userPassword: 0,
          _id: 0,
          __v: 0,
          accessToken: 0,
        }).lean();
        const finalData = {};
        const paymentInfo = await PaymentBase.findOne({
          userEmail: req.user.userEmail,
        }).sort({ createdAt: -1 });

        let dayName = "";
        if (data.birthDate) {
          dayName = moment(data.birthDate).format("dddd");
        }
        finalData.image = data.image || "";
        finalData.name = `${data.firstName} ${data.lastName}`;

        // Contact Details Section
        let emailIdString = "Buy Our Services For Contact Information";
        let contactNumberString = "Buy Our Services For Contact Information";
        let paymentPlan = "None";
        finalData.isAlreadyAdded = false;
        if (paymentInfo) {
          if (paymentInfo.savedProfiles.includes(data._id)) {
            finalData.isAlreadyAdded = true;
          }
          const localTimezone = "Asia/Kolkata";
          const atm = moment().tz(localTimezone);
          if (
            paymentInfo.isApproved === true &&
            (paymentInfo.profileCount == 0 ||
              paymentInfo.savedProfiles.length <
                paymentInfo.profileCount <
                parseInt(paymentInfo.profileCount)) &&
            moment.utc(paymentInfo.validTill).isAfter(atm.utc())
          ) {
            paymentPlan = "Active";
          }
          if (
            paymentInfo.savedProfiles.includes(data._id) &&
            paymentInfo.isApproved === 1 &&
            moment(paymentInfo.validTill).isAfter(moment())
          ) {
            emailIdString = data.userEmail;
            contactNumberString = data.phoneNumber;
          }

          // Email and Phone Verification
          emailIdString = data.isEmailVerified
            ? data.userEmail
            : "Unverified Email By Candidate";
          contactNumberString = data.isPhoneVerified
            ? data.phoneNumber
            : "Unverified Phone Number By Candidate";
          const currUser = await UserBase.findOne({ _id: req.user._id });
          if (!currUser.isEmailVerified) emailIdString = "Verify Your Email";
          if (!currUser.isPhoneVerified)
            contactNumberString = "Verify Your Mobile Number";
        }

        finalData.phoneNumber = contactNumberString;
        finalData.userEmail = emailIdString;
        finalData.community = data.community;

        // Reference Name
        if (data.referenceCode) {
          const adminData = await UserBase.findOne({
            __t: "admin",
            referenceCode: data.referenceCode,
          });
          finalData.referenceName = `${adminData.firstName} ${adminData.lastName}`;
        } else {
          finalData.referenceName = "NA";
        }

        // Other fields
        finalData.jobBusiness = data.jobBusiness || "Not Provided";
        finalData.degreeDiploma = data.degreeDiploma || "Not Provided";
        finalData.fieldJob = data.fieldJob || "Not Provided";
        finalData.degreeName = data.degreeName || "Not Provided";
        finalData.companyName = data.companyName || "Not Provided";
        finalData.incomeGroup = data.incomeGroup || "Not Provided";
        finalData.currentAddress = data.currentAddress || "Not Provided";
        finalData.fullAddress =
          `${data.currentAddress}, ${data.addressInShort}` || "Not Provided";

        // Birth Date and Time Section
        if (data.birthDate) {
          const birthDate = moment(data.birthDate).format("DD MMMM YYYY");
          dayName = moment(data.birthDate).format("dddd");
          finalData.birthDate = `${birthDate}, ${dayName}`;
        } else {
          finalData.birthDate = "Not Provided";
        }

        if (data.birthTime) {
          const formattedTime = moment(data.birthTime, "HH:mm:ss").format(
            "hh:mm A"
          );
          finalData.birthTime = formattedTime;
        } else {
          finalData.birthTime = "Not Provided";
        }

        finalData.birthPlace = data.birthPlace || "Not Provided";
        finalData.height = data.height ? `${data.height} Feet` : "Not Provided";
        finalData.bloodGroup = data.bloodGroup || "Not Provided";
        finalData.naadi = data.naadi || "Not Provided";
        finalData.disabilityYN = data.disabilityYN || "Not Applicable";
        finalData.raas = data.raas || "Not Provided";
        finalData.devak = data.devak || "Not Provided";
        finalData.gotra = data.gotra || "Not Provided";
        finalData.gana = data.gana || "Not Provided";
        finalData.charan = data.charan || "Not Provided";
        finalData.nakshatra = data.nakshatra || "Not Provided";

        // Family Details Section
        finalData.familyType = data.familyType || "Not Provided";
        finalData.siblingCount =
          data.siblingCount !== "0" ? data.siblingCount : "None";
        finalData.educationOfSiblings =
          data.educationOfSiblings || "Not Provided";
        finalData.property = data.property || "Not Provided";
        finalData.educationOfMother = data.educationOfMother || "Not Provided";
        finalData.educationOfFather = data.educationOfFather || "Not Provided";
        finalData.motherFamilyDetails =
          data.motherFamilyDetails || "Not Provided";
        finalData.fatherFamilyDetails =
          data.fatherFamilyDetails || "Not Provided";

        // Expectations Section
        finalData.selectedEducations = data.selectedEducations;
        finalData.selectedIncome = data.selectedIncome;
        finalData.expectedEatingHabits = data.expectedEatingHabits;
        finalData.expectedGana = data.expectedGana;
        finalData.expectedLocality = data.expectedLocality;
        finalData.expectedNakshatra = data.expectedNakshatra;
        finalData.expectedBloodGroups = data.expectedBloodGroups;
        finalData.expectedNaadi = data.expectedNaadi;
        finalData.expectedRaas = data.expectedRaas;
        finalData.expectedHeight = data.expectedHeight || "No bar";
        finalData.expectedFamilyType = data.expectedFamilyType;
        finalData.selectedSiblingsCousinsUpto =
          data.selectedSiblingsCousinsUpto || "No bar";
        finalData.expectedAgeGap =
          `${data.expectedAgeGapMin}-${data.expectedAgeGapMax} years` ||
          "No bar";
        finalData.expectedAgeGapMax = data.expectedAgeGapMax
          ? `${data.expectedAgeGapMax} years`
          : "No bar";
        finalData.expectedAgeGapMin = data.expectedAgeGapMin
          ? `${data.expectedAgeGapMin} years`
          : "No bar";
        finalData.strictMatch = data.strictMatch ? "Yes" : "No";
        finalData.isVerified = data.isVerified;
        finalData.paymentplan = paymentPlan;
        return res.status(200).json({ message: "success", data: finalData });
      } else {
        return res
          .status(401)
          .json({
            message: "failure",
            data: "You are unauthorised to get saved profiles",
          });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.post("/add-new-candidate", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      userEmail,
      userPassword,
      phoneNumber,
      referenceCode,
      lookingFor,
      choosingFor,
      readTCP,
    } = req.body;

    const user = await UserBase.findOne({ userEmail: userEmail });
    if (!user) {
      const hashedPassword = await bcrypt.hash(userPassword, 10);
      const newCandidate = await Candidate.create({
        firstName: firstName,
        lastName: lastName,
        userEmail: userEmail,
        userPassword: hashedPassword,
        phoneNumber: phoneNumber,
        referenceCode: referenceCode,
        lookingFor: lookingFor,
        choosingFor: choosingFor,
        readTCP: readTCP,
      });
      const payload = {
        _id: newCandidate._id,
        userEmail: userEmail,
        __t: "candidate",
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });

      await UserBase.findByIdAndUpdate(newCandidate._id, {
        accessToken: token,
      });

      res.cookie("token", token, {
        httpOnly: true, // Prevent access from JavaScript (security)
        // secure: true,    // Use HTTPS (for production)
        // sameSite: "None", // Prevent CSRF attacks
        sameSite: "Lax", // For localhost
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res
        .status(200)
        .json({ message: "success", data: "Profile created successfully" });
    } else {
      return res
        .status(200)
        .json({ message: "failure", data: "Account already exists" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post("/forgot-password", async (req, res) => {
  const { userEmail } = req.body;
  try {
    const user = await UserBase.findOne({ userEmail: userEmail });
    if (!user) {
      return res
        .status(404)
        .json({ message: "failure", data: "Account does not exist" });
    } else {
      let newPassword = "";
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < 10; i++) {
        const randomInd = Math.floor(Math.random() * characters.length);
        newPassword += characters.charAt(randomInd);
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: userEmail,
        subject: "Password Change Request",
        html: `
          <p>Your new password is: <strong>${newPassword}</strong></p>
          <p>Please log in and change your password from the "Change Password" menu.</p>
        `,
      };
      transporter
        .sendMail(mailOptions)
        .then((info) => console.log("Email sent:", info.response))
        .catch((error) => console.error("Error sending email:", error));
      await UserBase.findOneAndUpdate(
        { userEmail: userEmail },
        { $set: { userPassword: hashedPassword } }
      );
      return res.status(200).json({
        message: "success",
        data: "Your new password has been mailed on your registered email.",
        newPassword: newPassword,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post(
  "/change-password",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    const { newPassword } = req.body;
    const currentUser = req.user._id;
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await UserBase.findByIdAndUpdate(req.user._id, {
        $set: { userPassword: hashedPassword },
      });
      return res
        .status(200)
        .json({ message: "success", data: "Password changed successfully" });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

// This will be used to validate id the user is putting right reference code
commonRoutes.get("/get-unique-reference-codes", async (req, res) => {
  try {
    const refCodes = await UserBase.find({ __t: "admin" }).distinct(
      "referenceCode"
    );
    return res.status(200).json({ message: "success", data: refCodes });
  } catch (error) {
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post(
  "/logout-user",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      res.clearCookie("token", {
        httpOnly: true,
        sameSite: "Lax",
        // secure:true  // For Production
      });
      return res
        .status(200)
        .json({ message: "success", data: "Logged out successfully." });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.get(
  "/get-districts",
  async (req, res) => {
    try {
      const disticts = await DistrictMaster.find(
        { isActive: true },
        { _id: 0 }
      );
      return res.status(200).json({ message: "success", data: disticts });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.post("/enquire-Services", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailId,
      serviceRequest,
      city,
    } = req.body;
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
      subject: "Service Enquiry",
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
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <p> ${firstName}  ${lastName} wants to enquire for the following services:</p>
                <p>Service List: ${serviceRequest}</p> 
                <p>Contact Number: ${contactNumber}</p> 
                <p>Email: ${emailId}</p> 
                <p>City: ${city}</p> 
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
    return res.status(200).json({message:"success",data:"We have received your enquiry and we will get back to you at the earliest."})
  } catch (error) {
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post("/feedback", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailId,
      feedback,
      rating,
    } = req.body;
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
      subject: "Feedback",
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
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <p> ${firstName}  ${lastName} sent a feedback:</p>
                <p>Rating: ${rating}</p> 
                <p>Contact Number: ${contactNumber}</p> 
                <p>Email: ${emailId}</p> 
                <p>Feedback: ${feedback}</p> 
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
      return res.status(200).json({message:"success",data:"Thank you for the feedback. We will definitely consider the same."})

  } catch (error) {
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post("/contact", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailId,
      concern,
      description,
    } = req.body;
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
      subject: "Contact Request",
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
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
                line-height: 1.6;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <p> ${firstName}  ${lastName} sent a feedback:</p>
                <p>Contact Number: ${contactNumber}</p> 
                <p>Email: ${emailId}</p> 
                <p>Concern: ${concern}</p> 
                <p>Description: ${description}</p> 
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
      return res.status(200).json({message:"success",data:"We have received your contact request and we will get back to you as early as possible."})

  } catch (error) {
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

export default commonRoutes;
