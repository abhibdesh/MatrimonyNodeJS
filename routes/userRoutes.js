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


const userRoutes = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

let gfsBucket;

export function setGridFSBucket(bucket) {
  gfsBucket = bucket;
}

userRoutes.post("/update-my-profile",authMiddleware,updateLastActivity,async(req,res)=>{
  try{
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
      fatherFamilyDetails
    } = req.body;
    const currentUser = req.user._id;
    const user = await Candidate.findByIdAndUpdate(currentUser,{
      firstName:firstName,
      lastName:lastName,
      userEmail:userEmail,
      phoneNumber:phoneNumber,
      choosingFor:choosingFor,
      addressInShort:addressInShort,
      currentAddress:currentAddress,
      birthDate:birthDate,
      birthTime:birthTime,
      birthPlace:birthPlace,
      height:height,
      bloodGroup:bloodGroup,
      disabilityYN:disabilityYN,
      disablityDescription:disablityDescription,
      degreeDiploma:degreeDiploma,
      degreeName:degreeName,
      fieldJob:fieldJob,
      companyName:companyName,
      jobBusiness:jobBusiness,
      incomeGroup:incomeGroup,
      eatingHabits:eatingHabits,
      raas:raas,
      gotra:gotra,
      dosha:dosha,
      gana:gana,
      devak:devak,
      nakshatra:nakshatra,
      charan:charan,
      naadi:naadi,
      familyType:familyType,
      siblingCount:siblingCount,
      educationOfSiblings:educationOfSiblings,
      property:property,
      educationOfMother:educationOfMother,
      educationOfFather:educationOfFather,
      motherFamilyDetails:motherFamilyDetails,
      fatherFamilyDetails:fatherFamilyDetails
    },{
      new:true
    });
    res.status(200).json({message:"sucess",data:user,alert:"Profile updated succesfully"})
    // res.status(200).json({message:"sucess",data:"Profile updated sucessfully"})
  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }
});


export default userRoutes;