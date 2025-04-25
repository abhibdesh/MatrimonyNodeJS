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

userRoutes.get("/get-preferences",authMiddleware, updateLastActivity, async(req,res)=>{

  try{
    if(req.user.__t === "candidate"){
      const user = await Candidate.findById(req.user._id,{expectedEducations:1,expectedIncome:1,expectedEatingHabits:1,expectedGana:1,expectedNakshatra:1,expectedAgeGapMin:1,expectedAgeGapMax:1,expectedBloodGroups:1,expectedNaadi:1,expectedRaas:1,expectedHeight:1,expectedFamilyType:1,expectedSiblingsCousinsUpto:1,profileWithImages:1,strictMatch:1});
      res.status(200).json({message:"success",data:user})
    }
    else{
      res.status(200).json({message:"failure",data:"You are unauthorised to get preferences"})
    }
   
  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }

});

userRoutes.post("/update-preferences",authMiddleware,updateLastActivity,async(req,res)=>{
  try{

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
    
    await Candidate.findByIdAndUpdate(req.user._id,{
      expectedEducations:expectedEducations,
      expectedIncome:expectedIncome,
      expectedEatingHabits:expectedEatingHabits,
      expectedGana:expectedGana,
      expectedNakshatra:expectedNakshatra,
      expectedAgeGapMin:expectedAgeGapMin,
      expectedAgeGapMax:expectedAgeGapMax,
      expectedBloodGroups:expectedBloodGroups,
      expectedNaadi:expectedNaadi,
      expectedRaas:expectedRaas,
      expectedHeight:expectedHeight,
      expectedFamilyType:expectedFamilyType,
      expectedSiblingsCousinsUpto:expectedSiblingsCousinsUpto,
      profileWithImages:profileWithImages,
      strictMatch:strictMatch,
    });

    res.status(200).json({message:"success",data:"Your preferences are updated successfully"})

  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }
});


export default userRoutes;