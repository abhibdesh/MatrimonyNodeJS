import express, { Router } from "express";
import UserBase from "../models/UserBase.js";
import Admin from "../models/AdminBase.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import mongoose from "mongoose";
import updateLastActivity from "../middleware/updateLastActivity.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";
import MenuMaster from "../models/MenuMaster.js";


const ownerRoutes = express.Router();

ownerRoutes.post("/add-admin",authMiddleware,updateLastActivity, async (req, res) => {
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
        percentageShare:parseFloat(percentageShare)
      });
      console.log(user);
      res.status(200).json({
        message: "success",
        data: "Admin account created successfully",
      });
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


ownerRoutes.get("/get-payments-to-approve",authMiddleware,updateLastActivity,async(req,res)=>{
    try{

      // if(req.user.__t !== "owner"){
      //   return res
      //     .status(401)
      //     .json({
      //       message: "failure",
      //       data: "You are unauthorised to approve payments",
      //     });

      // }
      // else{
      const  totalCount= await Payment.countDocuments({isApproved:false,isPaymentSettled:false});
        
      const pendingPayments = await Payment.find({isApproved:false,isPaymentSettled:false});
        return res.status(200).json({message:"success",data:pendingPayments,totalCount:totalCount})
      // }

    }
    catch(error){
      console.log(error);
      return res.status(500).json({ message: "failure", data: error.message });
    }
});

ownerRoutes.get( "/get-payment-settlement", authMiddleware, updateLastActivity, async (req, res) => {
    try {
      const localTimezone = "Asia/Kolkata";
      const atm = moment().tz(localTimezone);
      const currentMonth = atm.month() + 1;
      const currentYear = atm.year();
      const result = await Payment.aggregate([
        {
          $match: {
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
            _id: "$referenceCode", 
            unsettledAmount: { $sum: "$amountPaid" },
            paymentIds: { $push: "$_id" }
          },
        },
        {
          $lookup: {
            from: "User", 
            let: { refCode: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$referenceCode", "$$refCode"] },
                      { $eq: ["$__t", "admin"] }, 
                    ],
                  },
                },
              },
            ],
            as: "adminData",
          },
        },
        {
          $unwind: {
            path: "$adminData",
            preserveNullAndEmptyArrays: false, 
          },
        },
        {
          $addFields: {
            percentageShare: "$adminData.percentageShare",
            payableAmount: {
              $ceil: {
                $divide: [
                  { $multiply: ["$unsettledAmount", "$adminData.percentageShare"] },
                  100,
                ],
              },
            },
          },
        },
        {
          $project: {
            referenceCode: "$_id",
            unsettledAmount: 1,
            percentageShare: 1,
            payableAmount: 1,
            paymentIds: 1,
            _id: 0,
          },
        },
      ]);
      return res.status(200).json({ message:"success", data:result });
    } catch (error) {
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

ownerRoutes.post("/approve-payments",authMiddleware,updateLastActivity,async(req,res)=>{
    try{
      const {transaction} = req.body;
      const localTimezone = "Asia/Kolkata"; // or your preferred TZ
      const atm = moment().tz(localTimezone);
      await Payment.findByIdAndUpdate(transaction,{
        isApproved:true,
        approvalTimestamp:atm
      })
      return res.status(200).json({message:"success",data:"This payment has been approved successfully."})
    }
    catch(error){
      return res.status(500).json({message:"failure",data:error.message})
    }
});

ownerRoutes.post("/mark-settlement-as-done",authMiddleware,updateLastActivity,async(req,res)=>{

  try{
    const {transactionId} = req.body;
    await Payment.updateMany({"_id":{$in:transactionId}},{$set:{isPaymentSettled:true}});
    return res.status(200).json({message:"success",data:"Payment Settlement Marked successfully"})
  }
  catch(error){
    return res.status(500).json({message:"failure",data:error.message})
  }

});

ownerRoutes.post("/add-new-menu",authMiddleware,updateLastActivity,async(req,res)=>{
  try {
    const { displayName, path, __t, priority, isActive } = req.body;
    await MenuMaster.create({ displayName: displayName, path: path, __t: __t, priority: priority,isActive:isActive });
    return res
      .status(200)
      .json({ message: "success", data: "Menu created succesfully" });
  } catch (error) {
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

export default ownerRoutes;
