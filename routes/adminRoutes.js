import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import { Router } from "express";
import Admin from "../models/AdminBase.js";


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
})

export default adminRoutes;