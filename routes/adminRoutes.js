import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Admin from "../models/AdminBase.js";
import Payment from "../models/Payment.js";
import moment from "moment-timezone";


const adminRoutes = Router();

adminRoutes.post("/verify-candidate",authMiddleware,updateLastActivity,async(req,res)=>{
    const {userId} = req.body;
    const currentUser = req.user;
    try{
        if(req.user.__t === "candidate"){
            res.status(401).json({message:"failure",message:"You are unauthorised to verify a candidate"})
        }
        else{
            const user = await Candidate.findById(userId);
            if(!user){
                res.status(404).json({message:"failure",data:"User not found"})
            }
            else{
                await Candidate.findByIdAndUpdate(userId,{$set:{isVerified:true}})
                res.status(200).json({message:"success",data:"Candidate verfied successfully"})
            }
        }
    }catch(error){
        res.status(500).json({message:"failure",data:error.message})
    }
    console.log(currentUser)
    console.log(userId)
});

adminRoutes.get("/get-users-without-community",authMiddleware,updateLastActivity,async(req,res)=>{
    try{
        console.log(req.user)
        if(req.user.__t === "admin"){
            const admin = await Admin.findById(req.user._id)
            console.log(admin.referenceCode)
            const users = await Candidate.find({__t:"candidate",referenceCode:admin.referenceCode,community:""},{_id:1,firstName:1,lastName:1,userEmail:1,isEmailVerified:1,phoneNumber:1,isPhoneVerified:1});
            res.status(200).json({message:"success",data:users});
        }
        if(req.user.__t === "candidate"){
            res.status(401).json({message:"success",data:"You are unauthorised to get this information"});
        }
        if(req.user.__t === "owner"){
            const users = await Candidate.find({__t:"candidate",referenceCode:""});
            res.status(200).json({message:"success",data:users});        }
    }
    catch(error){
        res.status(500).json({message:"failure",data:error.message})
    }
});

adminRoutes.post("/assign-community-to-candidate",authMiddleware,updateLastActivity,async(req,res)=>{});


adminRoutes.get("/get-my-references",authMiddleware,updateLastActivity,async(req,res)=>{
    try {
      if (req.user.__t !== "admin") {
        res.status(401).json({ message: "failure", data: "You are unauthorised to get the references",
        });
      } else {
        const user = req.user._id;
        const {rowsPerPage, pageNumber} = req.body;
        const currentUser = await Admin.findById(user);
        const references = await Payment.find({ referenceCode: currentUser.referenceCode, isApproved: true}).sort({ approvalTimestamp: -1 }).skip((pageNumber-1)*rowsPerPage).limit(rowsPerPage);
        const totalCount = await Payment.countDocuments({ referenceCode: currentUser.referenceCode, isApproved: true});
        console.log(totalCount)
        const localTimezone = "Asia/Kolkata";
        const atm = moment().tz(localTimezone);
        const currentMonth = atm.month() + 1;
        const currentYear = atm.year();

        const result = await Payment.aggregate([
            {
              $match: {
                referenceCode: currentUser.referenceCode,
                isApproved: true,
                isPaymentSettled: false
              }
            },
            {
              $addFields: {
                approvalMonth: { $month: "$approvalTimestamp" },
                approvalYear: { $year: "$approvalTimestamp" }
              }
            },
            {
              $match: {
                approvalMonth: currentMonth,
                approvalYear: currentYear
              }
            },
            {
              $group: {
                _id: null,
                unsettledAmount: { $sum: "$amountPaid" }
              }
            }
          ]);
          
        const unsettledAmount = result[0]?.unsettledAmount || 0;
        let originalPayableAmount = (unsettledAmount * currentUser.percentageShare)/100

        const data = {
          references: references,
          unsettledAmount: Math.ceil(originalPayableAmount),
          percentageShare: currentUser.percentageShare,
          total: totalCount
        };
        res.status(200).json({ message: "success", data: data });
      }
    } catch (error) {
      res.status(500).json({ message: "failure", data: error.message });
    }
});

adminRoutes.get("/get-my-community-list",authMiddleware,updateLastActivity,async(req,res)=>{
    try{
        if(req.user.__t === "admin"){
            const user = await Admin.findById(req.user._id);
            res.status(200).json({message:"success",data:user.communityList})
        }
    }
    catch(error){
        res.status(500).json({message:"failure",data:error.message})
    }
});


export default adminRoutes;