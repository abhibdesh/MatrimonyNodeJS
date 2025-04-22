import express from "express";
import UserBase from "../models/UserBase.js";
import Admin from "../models/AdminBase.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import mongoose from "mongoose";

const ownerRoutes = express.Router();

ownerRoutes.post("/add-admin", async (req, res) => {
  try {
    const { firstName, lastName, userEmail, phoneNumber, userPassword, communityList, percentageShare} =
      req.body;
    const hashedPassword = await bcrypt.hash(userPassword, 10);
    const user = await UserBase.findOne({ userEmail: userEmail });
    console.log(user);
    if (!user) {
      let random = Math.floor(Math.random() * (9999 - 999 + 1)) + 999;
      let name = firstName + lastName;
      await Admin.create({
        firstName: firstName,
        lastName: lastName,
        referenceCode: name.slice(0, 3).toUpperCase() + random,
        communityList: communityList,
        phoneNumber: phoneNumber,
        userEmail: userEmail,
        userPassword: hashedPassword,
        percentageShare:percentageShare
      });
      console.log(user);
      res.status(200).json({
        message: "success",
        data: "Admin account created successfully",
      });
    } else {
      res
        .status(200)
        .json({ message: "failure", data: "Account already exists" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "failure", data: error.message });
  }
});

export default ownerRoutes;
