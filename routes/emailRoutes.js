import express from "express";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Candidate from "../models/User.js";
import nodemailer from "nodemailer";
import UserBase from "../models/UserBase.js";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";

const emailRoutes = express.Router();

const environment = process.env.ENVIRONMENT_NAME;
const testEmail = process.env.TESTEMAIL;

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
};

const generateEmail = (header, body) => {
  return `<!DOCTYPE html>
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
          <div class="header">${header}</div>
          <div class="content">
              ${body}
          </div>
          <p>Best regards,<br />Team Fyjix</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Suta Bandhan By Fyjix. All rights reserved.
        </div>
        </body>
        </html>`;
};

emailRoutes.post(
  "/request-info",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { userId, reqList } = req.body;
      const currentUser = await Candidate.findById(req.user._id);
      const receiver = await Candidate.findById(userId);

      const transporter = createTransporter();

      let receiverMail;
      if (environment === "LOCAL" || environment === "UAT") {
        receiverMail = testEmail;
      } else {
        receiverMail = receiver.userEmail;
      }

      const mailOptions = {
        from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
        to: receiverMail,
        bcc: process.env.ADMIN_EMAILS.split(";"),
        subject: "Information Request",
        html: generateEmail(
          "Information Request",
          `
              <p>Hi ${receiver.firstName},</p>
              <p>${currentUser.firstName} ${
            currentUser.lastName
          } has requested the following information:</p>
              <p>${reqList.join(",")}</p>`
        ),
      };
      transporter
        .sendMail(mailOptions)
        .then((info) => console.log("Email sent:", info.response))
        .catch((error) => console.error("Error sending email:", error));
      return res.status(200).json({
        message: "success",
        data: "We have received your enquiry and we will get back to you at the earliest.",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

emailRoutes.post("/forgot-password", async (req, res) => {
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
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      for (let i = 0; i < 10; i++) {
        const randomInd = Math.floor(Math.random() * characters.length);
        newPassword += characters.charAt(randomInd);
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const transporter = createTransporter();

      let receiver;
      if (environment === "LOCAL" || environment === "UAT") {
        receiver = testEmail;
      } else {
        receiver = userEmail;
      }
      const mailOptions = {
        from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
        to: receiver,
        bcc: process.env.ADMIN_EMAILS.split(";"),
        subject: "Password Change Request",
        html: generateEmail(
          "Password Reset",
          `<p>Hi ${userEmail},</p>
            <p>We received a password reset from this account. Your new password is:</p>
            <div class="otp-box">${newPassword}</div>
            <p>We request you to login via this password and change it immediately from change password menu.</p>
            <p>If you did not request this, please ignore this email.</p>`
        ),
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

emailRoutes.post("/enquire-Services", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailId,
      serviceRequest,
      city,
    } = req.body;
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAILS.split(";"),
      subject: "Service Enquiry",
      html: generateEmail(
        "Service Enquiry",
        `<p> ${firstName} ${lastName} wants to enquire for the following services:</p>
                  <p>Service List: ${serviceRequest}</p> 
                  <p>Contact Number: ${contactNumber}</p> 
                  <p>Email: ${emailId}</p> 
                  <p>City: ${city}</p> `
      ),
    };
    transporter
      .sendMail(mailOptions)
      .then((info) => console.log("Email sent:", info.response))
      .catch((error) => console.error("Error sending email:", error));
    return res.status(200).json({
      message: "success",
      data: "We have received your enquiry and we will get back to you at the earliest.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

emailRoutes.post("/feedback", async (req, res) => {
  try {
    const { firstName, lastName, contactNumber, emailId, feedback, rating } =
      req.body;
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAILS.split(";"),
      subject: "Feedback",
      html: generateEmail(
        "Feeback Received",
        `<p> ${firstName}  ${lastName} sent a feedback:</p>
                  <p>Rating: ${rating}</p> 
                  <p>Contact Number: ${contactNumber}</p> 
                  <p>Email: ${emailId}</p> 
                  <p>Feedback: ${feedback}</p>`
      ),
    };
    transporter
      .sendMail(mailOptions)
      .then((info) => console.log("Email sent:", info.response))
      .catch((error) => console.error("Error sending email:", error));
    return res.status(200).json({
      message: "success",
      data: "Thank you for the feedback. We will definitely consider the same.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

emailRoutes.post("/contact", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailId,
      concern,
      description,
    } = req.body;
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAILS.split(";"),
      subject: "Contact Request",
      html: generateEmail(
        "Contact Request",
        `<p> ${firstName}  ${lastName} sent a conatct request:</p>
                  <p>Contact Number: ${contactNumber}</p> 
                  <p>Email: ${emailId}</p> 
                  <p>Concern: ${concern}</p> 
                  <p>Description: ${description}</p>`
      ),
    };
    transporter
      .sendMail(mailOptions)
      .then((info) => console.log("Email sent:", info.response))
      .catch((error) => console.error("Error sending email:", error));
    return res.status(200).json({
      message: "success",
      data: "We have received your contact request and we will get back to you as early as possible.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

emailRoutes.post("/join-us-as-admins", async (req, res) => {
  try {
    const { firstName, lastName, contactNumber, emailId } = req.body;
    const transporter = createTransporter();
    const mailOptions = {
      from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAILS.split(";"),
      subject: "Admin Request",
      html: generateEmail(
        "Admin Request",
        ` <p> ${firstName}  ${lastName} sent an admin request:</p>
                  <p>Contact Number: ${contactNumber}</p> 
                  <p>Email: ${emailId}</p>`
      ),
    };
    transporter
      .sendMail(mailOptions)
      .then((info) => console.log("Email sent:", info.response))
      .catch((error) => console.error("Error sending email:", error));
    return res.status(200).json({
      message: "success",
      data: "We have received your admin request and it is under review. We will get back to you as early as possible.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

emailRoutes.post(
  "/partner-request",
  [
    body("firstName").notEmpty().withMessage("First Name is required"),
    body("lastName").notEmpty().withMessage("Last Name is required"),
    body("businessCategory")
      .notEmpty()
      .withMessage("Business Category is required"),
    body("businessName").notEmpty().withMessage("Business Name is required"),
    body("contactNumber").notEmpty().withMessage("Contact Number is required"),
    body("emailId").isEmail().withMessage("Valid email is required"),
    body("website")
      .optional({ checkFalsy: true })
      .isURL()
      .withMessage("Website must be a valid URL"),
    body("description")
      .if(body("website").not().exists({ checkFalsy: true }))
      .notEmpty()
      .withMessage("Description is required if website is not provided"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({message :"validation_error", errors: errors.array() });
      }
      const {
        firstName,
        lastName,
        businessCategory,
        businessName,
        contactNumber,
        emailId,
        website,
        description,
      } = req.body;
      const transporter = createTransporter();

      const mailOptions = {
        from: `"Suta Bandhan Support" <${process.env.GMAIL_USER}>`,
        to: process.env.ADMIN_EMAILS.split(";"),
        subject: "Partner Request",
        html: generateEmail(
          "Partner Request",
          `<p> ${firstName}  ${lastName} sent a partner request:</p>
                  <p>Business Name: ${businessName}</p> 
                  <p>Business Category: ${businessCategory}</p> 
                  <p>Contact Number: ${contactNumber}</p> 
                  <p>Email: ${emailId}</p> 
                  <p>Website: ${website}</p> 
                  <p>Description: ${description}</p>`
        ),
      };
      transporter
        .sendMail(mailOptions)
        .then((info) => console.log("Email sent:", info.response))
        .catch((error) => console.error("Error sending email:", error));
      return res.status(200).json({
        message: "success",
        data: "We have received your partner request and it is under review. We will get back to you as early as possible.",
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

export default emailRoutes;
