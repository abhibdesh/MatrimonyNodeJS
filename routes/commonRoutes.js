import express from "express";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import mongoose from "mongoose";
import Admin from "../models/AdminBase.js";

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
        .status(401)
        .json({ message: "failure", data: "Invalid credentials" });
    }

    const payload = {
      _id: user._id,
      userRole: user.userRole,
      userEmail: user.userEmail,
      __t: user.__t,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    await UserBase.findByIdAndUpdate(user._id, { accessToken: token });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "success",
      data: "User logged in successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// TODO: Need to work on filters and add preferences
commonRoutes.get( "/get-all-users", authMiddleware, updateLastActivity, async (req, res) => {
    try {
      const {filters, rowsPerPage,pageNumber} = req.body;
      const currentUser = req.user._id;
      if(req.user.__t === "candidate"){
        const candidate = await Candidate.findById(currentUser);
        const updatedFilter = filters;
        updatedFilter.__t = "candidate";
        updatedFilter.lookingFor = candidate.lookingFor === "Bride" ? "Groom" : "Bride";
        updatedFilter.community = candidate.community;
        const totalCount = await Candidate.countDocuments(updatedFilter);
        const users = await Candidate.find( updatedFilter ,{_id:1,firstName:1,lastName:1,birthDate:1,birthTime:1,birthPlace:1,incomeGroup:1,addressInShort:1,community:1}).skip((pageNumber-1)*rowsPerPage).limit(rowsPerPage);
        res.status(200).json({message:"success",data:users,totalCount:totalCount});
      }
      if(req.user.__t === "admin"){
        const admin = await Admin.findById(req.user._id);
        const updatedFilter = filters;
        updatedFilter.__t = "candidate";
        updatedFilter.referenceCode = admin.referenceCode;
        const users = await Candidate.find( updatedFilter ,{_id:1,firstName:1,lastName:1,birthDate:1,birthTime:1,birthPlace:1,incomeGroup:1,addressInShort:1,community:1});
        res.status(200).json({message:"success",data:users});
      }
      if(req.user.__t === "owner"){
        const users = await UserBase.find({ _id: { $ne: currentUser } },{_id:1,firstName:1,lastName:1,birthDate:1,birthTime:1,birthPlace:1,incomeGroup:1,addressInShort:1});
        res.status(200).json({message:"success",data:users});
      }  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

commonRoutes.post("/user-log-out", async (req, res) => {
  UserBase.findByIdAndUpdate(req.user._id, {});
});


commonRoutes.get("/get-my-profile",authMiddleware,updateLastActivity,async(req,res)=>{

  try{
    const user = await UserBase.findById(req.user._id);
    res.status(200).json({message:"success",data:user})

  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }

});


// TODO : Will be changed after payment plan APIs will be completed
commonRoutes.get("/get-profile-by-id",authMiddleware,updateLastActivity,async(req,res)=>{

  try{
    const {userId} = req.body;
    const user = await UserBase.findById(userId,{lastActivity:0,createdAt:0,updatedAt:0,__t:0,isDeleted:0,isActive:0,isLoggedIn:0,lastLogoutTime:0,userPassword:0});
    res.status(200).json({message:"success",data:user})
  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }

});

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
      familyType,
      siblingCount,
      educationOfSiblings,
      property,
      educationOfMother,
      educationOfFather,
      motherFamilyDetails,
      fatherFamilyDetails,
      expectedEducations,
      expectedIncome,
      eatingHabitsExpected,
      expectedGana,
      charan,
      naadi,
      expectedNakshatra,
      strictMatch,
      userPaid,
      profileWithImages,
      readTCP,
      expectedAgeGapMin,
      expectedAgeGapMax,
      expectedBloodGroups,
      expectedNaadi,
      expectedRaas,
      expectedFamilyType,
      expectedSiblingsCousinsUpto,
    } = req.body;

    const user = await UserBase.findOne({ userEmail: userEmail });
    if (!user) {
      const hashedPassword = await bcrypt.hash(userPassword, 10);

      await Candidate.create({
        firstName: firstName,
        lastName: lastName,
        userEmail: userEmail,
        userPassword: hashedPassword,
        phoneNumber: phoneNumber,
        referenceCode: referenceCode,
        lookingFor: lookingFor,
        choosingFor: choosingFor,
        addressInShort: addressInShort,
        currentAddress: currentAddress,
        birthDate: birthDate !== null ? Date.parse(birthDate) : birthDate,
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
        expectedEducations: expectedEducations,
        expectedIncome: expectedIncome,
        eatingHabitsExpected: eatingHabitsExpected,
        expectedGana: expectedGana,
        expectedNakshatra: expectedNakshatra,
        expectedAgeGapMin: expectedAgeGapMin,
        expectedAgeGapMax: expectedAgeGapMax,
        expectedBloodGroups: expectedBloodGroups,
        expectedNaadi: expectedNaadi,
        expectedRaas: expectedRaas,
        expectedFamilyType: expectedFamilyType,
        expectedFamilyType: expectedFamilyType,
        expectedSiblingsCousinsUpto: expectedSiblingsCousinsUpto,
        strictMatch: strictMatch,
        userPaid: userPaid,
        profileWithImages: profileWithImages,
        readTCP: readTCP,
      });
      res
        .status(200)
        .json({ message: "success", data: "Profile created successfully" });
    } else {
      res
        .status(401)
        .json({ message: "failure", data: "Account already exists" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post("/forgot-password", async (req, res) => {
  const { userEmail } = req.body;
  try {
    const user = await UserBase.findOne({ userEmail: userEmail });
    if (!user) {
      res
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
      const user = await UserBase.findOneAndUpdate(
        { userEmail: userEmail },
        { $set: { userPassword: hashedPassword } }
      );
      res
        .status(200)
        .json({
          message: "success",
          data: "Your new password has been mailed on your registered email.",
          newPassword: newPassword,
        });
    }
  } catch (error) {
    res.status(500).json({ message: "failure", data: error.message });
  }
});

commonRoutes.post( "/change-password", authMiddleware, updateLastActivity, async (req, res) => {
  const {newPassword} = req.body;
  const currentUser = req.user._id;
  try{
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await UserBase.findByIdAndUpdate(req.user._id,{$set:{userPassword:hashedPassword}})
    res.status(200).json({message:"success",data:"Password changed successfully"})
  }catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }
  console.log(currentUser)
});


// This will be used to validate id the user is putting right reference code
commonRoutes.get("/get-unique-reference-codes",async(req,res)=>{
  try{

    const refCodes = await UserBase.find({__t:"admin"}).distinct("referenceCode");
    res.status(200).json({message:"success",data:refCodes});
    
  }
  catch(error){
    res.status(500).json({message:"failure",data:error.message})
  }
});

export default commonRoutes;
