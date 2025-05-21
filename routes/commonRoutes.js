import express from "express";
import UserBase from "../models/UserBase.js";
import Candidate from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import updateLastActivity from "../middleware/updateLastActivity.js";
import mongoose from "mongoose";
import Admin from "../models/AdminBase.js";
import MenuMaster from "../models/MenuMaster.js";
import DistrictMaster from "../models/DistrictsBase.js";
import PaymentBase from "../models/Payment.js";
import moment from "moment-timezone";
import dotenv from "dotenv";
dotenv.config();

const commonRoutes = express.Router();

commonRoutes.get("/health-check", async (req, res) => {
  try {
    return res.status(200).json({ message: "success", data: "Healthy" });
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

const isFilled = (value) => {
  return !(
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'number' && isNaN(value))
  );
};

const calculateProfileCompletion = async (id) => {
  const userObj = await UserBase.findById(id).lean();
  const keysToCheck = Object.keys(userObj).filter(
    (key) => ['addressInShort','currentAddress',
      'community','image','images','birthDate','birthPlace','height','bloodGroup','disabilityYN',
      'disablityDescription','degreeDiploma','degreeDiploma','degreeName',
      'fieldJob','companyName','jobBusiness','incomeGroup','eatingHabits',
      'raas','gotra','dosha','gana','devak','nakshatra','charan','naadi','familyType',
      'siblingCount','educationOfSiblings','property','educationOfMother','educationOfFather',
      'motherFamilyDetails','fatherFamilyDetails'].includes(key)
  );

  const total = keysToCheck.length;
  const filled = keysToCheck.reduce((acc, key) => {
    return acc + (isFilled(userObj[key]) ? 1 : 0);
  }, 0);

  const percentage = Math.round((filled / total) * 100);

  console.log(`Filled: ${filled}/${total} fields (${percentage}%)`);
  return percentage;
};

async function paginateUsers(query, projection, pageNumber, rowsPerPage) {
  const totalCount = await UserBase.countDocuments(query);
  const users = await UserBase.find(query, projection)
    .skip((pageNumber - 1) * rowsPerPage)
    .limit(rowsPerPage);
  return { users, totalCount };
}

function applyFilters(query, filters = {}, currentUser = {}) {
  const toArray = (val) => Array.isArray(val) ? val : [];

  const mergeOrAddExpected = (filterKey, expectedKey) => {
    const filterVals = toArray(filters?.[filterKey]);
    const expectedVals = toArray(currentUser?.[expectedKey]);

    // Merge and deduplicate
    const mergedVals = [...new Set([...filterVals, ...expectedVals])];
    return mergedVals;
  };

  const mapFilters = [
    ["selectedEducations", "selectedEducations", "expectedEducations"],
    ["addressInShort", "selectedLocatities", "expectedLocatities"],
    ["incomeGroup", "selectedIncome", "expectedIncome"],
    ["eatingHabits", "expectedEatingHabits", "expectedEatingHabits"],
    ["gana", "expectedGana", "expectedGana"],
    ["nakshatra", "expectedNakshatra", "expectedNakshatra"],
    ["bloodGroup", "expectedBloodGroups", "expectedBloodGroups"],
    ["naadi", "expectedNaadi", "expectedNaadi"],
    ["raas", "expectedRaas", "expectedRaas"],
    ["familyType", "expectedFamilyType", "expectedFamilyType"],
    ["selectedSiblingsCousinsUpto", "selectedSiblingsCousinsUpto", "expectedSiblingsCousinsUpto"],
    ["profileWithImages", "profileWithImages", "profileWithImages"],
  ];

  for (const [field, filterKey, expectedKey] of mapFilters) {
    const vals = mergeOrAddExpected(filterKey, expectedKey);
    if (vals.length > 0) {
      query[field] = { $in: vals };
    }
  }
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
    const percent = await calculateProfileCompletion(user._id);

    res.cookie("token", token, {
      httpOnly: true, // Prevent access from JavaScript (security)
      secure: true, // Use HTTPS (for production)
      sameSite: "None", // Prevent CSRF attacks
      // sameSite: "Lax", // For localhost
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "success",
      data: "User logged in successfully",
      percent: percent
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({message: "failure", data: error.message });
  }
});

commonRoutes.get(
  "/get-menu-master",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const menu = await MenuMaster.find(
        { isActive:true,__t: { $in: [req.user.__t] } },
        { _id: 0, displayName: 1, path: 1, priority: 1 }
      ).sort({ priority: 1 });
      res.status(200).json({
        message: "success",
        data: menu,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "failure",data: error.message });
    }
  }
);

commonRoutes.post(
  "/get-all-users",
  authMiddleware,
  updateLastActivity,
  async (req, res) => {
    try {
      const { filters, rowsPerPage, pageNumber } = req.body;
      const currentUser = await UserBase.findById(req.user._id);
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

      let query = {
        _id: { $ne: currentUser._id },
        isDeleted: false,
        isActive: true,
        community:currentUser.community
      };

      if(filters.expectedAgeGapMin !==null){
        const fromDate = new Date(`${filters.expectedAgeGapMin}-01-01T00:00:00.000Z`);
        query.birthDate ={$gte:fromDate}
      }
      if(filters.expectedAgeGapMax !==null){
        const toDate = new Date(`${filters.expectedAgeGapMax}-12-31T23:59:59.999Z`);
        query.birthDate ={$lte:toDate}
      }

      query.height ={$gte:filters.selectedFromHeight,$lte:filters.selectedToHeight};
      query.community ={$ne:""};
      query.isVerified = true;
      query.isEmailVerified = true;
      query.isPhoneVerified = true;


      if (req.user.__t === "candidate") {
        applyFilters(query, filters, currentUser);
        query.lookingFor = { $ne: currentUser.lookingFor };
        query.__t ="candidate";
      } else if (req.user.__t === "admin") {
        const admin = await Admin.findById(req.user._id);
        applyFilters(query, filters, currentUser);
        query.referenceCode = admin.referenceCode;
        query.__t ="candidate";
        query.isVerified =true;
        delete query.height;
      } else if (req.user.__t === "owner") {
        delete query.__t;
        delete query.lookingFor;
      }
      console.log("filters")
      console.log(filters)
      console.log("query")
      console.log(query)
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
    } catch (error) {
      console.log(error)
      res.status(500).json({ message: "failure", data:error.message });
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
        data: user,
        media:media,
        percent : await calculateProfileCompletion(req.user._id)
      });
    } catch (error) {
      console.log(error)
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
      const user = await UserBase.findById(userId, {
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

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const finalData = {
        image: user.image || "",
        name: `${user.firstName} ${user.lastName}`,
        isAlreadyAdded: false,
        paymentplan: "None",
      };

      const paymentInfo = await PaymentBase.findOne({
        userEmail: req.user.userEmail,
      }).sort({ createdAt: -1 });

      const allPayments = await PaymentBase.find({
        userEmail: req.user.userEmail,
      });

      const userIdList = allPayments
        .flatMap((p) => p.savedProfiles || [])
        .filter(Boolean)
        .map((id) => id);

      if (paymentInfo) {
        if (userIdList.includes(user._id.toString())) {
          finalData.isAlreadyAdded = true;
        }
        const localTime = moment().tz("Asia/Kolkata");
        if (
          paymentInfo.isApproved &&
          (!paymentInfo.profileCount ||
            paymentInfo.savedProfiles.length < paymentInfo.profileCount) &&
          moment.utc(paymentInfo.validTill).isAfter(localTime.utc())
        ) {
          finalData.paymentplan = "Active";
        }
      }

      if (user.referenceCode) {
        const admin = await UserBase.findOne({
          __t: "admin",
          referenceCode: user.referenceCode,
        });
        finalData.referenceName = admin
          ? `${admin.firstName} ${admin.lastName}`
          : "NA";
      } else {
        finalData.referenceName = "NA";
      }

      Object.assign(finalData, {
        jobBusiness: user.jobBusiness || "Not Provided",
        degreeDiploma: user.degreeDiploma || "Not Provided",
        fieldJob: user.fieldJob || "Not Provided",
        degreeName: user.degreeName || "Not Provided",
        companyName: user.companyName || "Not Provided",
        incomeGroup: user.incomeGroup || "Not Provided",
        currentAddress: user.currentAddress || "Not Provided",
        fullAddress:
          user.currentAddress && user.addressInShort
            ? `${user.currentAddress}, ${user.addressInShort}`
            : "Not Provided",
        birthDate: user.birthDate
          ? `${moment(user.birthDate).format("DD MMMM YYYY")}, ${moment(
              user.birthDate
            ).format("dddd")}`
          : "Not Provided",
        birthTime: user.birthTime
          ? moment(user.birthTime, "HH:mm:ss").format("hh:mm A")
          : "Not Provided",
        birthPlace: user.birthPlace || "Not Provided",
        height: user.height ? `${user.height} Feet` : "Not Provided",
        bloodGroup: user.bloodGroup || "Not Provided",
        disabilityYN: user.disabilityYN || "Not Applicable",

        // Expectations
        selectedEducations: user.selectedEducations || "No bar",
        selectedIncome: user.selectedIncome || "No bar",
        expectedEatingHabits: user.expectedEatingHabits || "No bar",
        expectedGana: user.expectedGana || "No bar",
        expectedLocality: user.expectedLocality || "No bar",
        expectedNakshatra: user.expectedNakshatra || "No bar",
        expectedBloodGroups: user.expectedBloodGroups || "No bar",
        expectedNaadi: user.expectedNaadi || "No bar",
        expectedRaas: user.expectedRaas || "No bar",
        expectedHeight: user.expectedHeight || "No bar",
        expectedFamilyType: user.expectedFamilyType,
        selectedSiblingsCousinsUpto:
          user.selectedSiblingsCousinsUpto || "No bar",
        expectedAgeGap:
          user.expectedAgeGapMin && user.expectedAgeGapMax
            ? `${user.expectedAgeGapMin}-${user.expectedAgeGapMax} years`
            : "No bar",
        expectedAgeGapMax: user.expectedAgeGapMax
          ? `${user.expectedAgeGapMax} years`
          : "No bar",
        expectedAgeGapMin: user.expectedAgeGapMin
          ? `${user.expectedAgeGapMin} years`
          : "No bar",
        strictMatch: user.strictMatch ? "Yes" : "No",
        isVerified: user.isVerified,
      });
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
          const joined = chunks.map((c) => c.data.toString("base64")).join("");

          return {
            fileId: file._id,
            filename: file.filename,
            contentType: file.contentType,
            length: file.length,
            base64: joined,
          };
        })
      );
      return res.status(200).json({
        message: "success",
        data: finalData,
        media,
        userRole:req.user.__t
      });
    } catch (error) {
      console.error(error);
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
      if (!req.user.__t) {
        return res.status(401).json({
          message: "failure",
          data: "You are unauthorised to get saved profiles",
        });
      }

      const userProjection = {
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
      };

      const data = await UserBase.findById(userId, userProjection).lean();
      if (!data) throw new Error("User not found");

      const finalData = {
        image: data.image || "",
        name: `${data.firstName} ${data.lastName}`,
        isAlreadyAdded: false,
        jobBusiness: data.jobBusiness || "Not Provided",
        degreeDiploma: data.degreeDiploma || "Not Provided",
        fieldJob: data.fieldJob || "Not Provided",
        degreeName: data.degreeName || "Not Provided",
        companyName: data.companyName || "Not Provided",
        incomeGroup: data.incomeGroup || "Not Provided",
        currentAddress: data.currentAddress || "Not Provided",
        fullAddress: data.addressInShort
          ? `${data.currentAddress}, ${data.addressInShort}`
          : "Not Provided",
        birthPlace: data.birthPlace || "Not Provided",
        height: data.height ? `${data.height} Feet` : "Not Provided",
        bloodGroup: data.bloodGroup || "Not Provided",
        naadi: data.naadi || "Not Provided",
        disabilityYN: data.disabilityYN || "Not Applicable",
        raas: data.raas || "Not Provided",
        devak: data.devak || "Not Provided",
        gotra: data.gotra || "Not Provided",
        gana: data.gana || "Not Provided",
        charan: data.charan || "Not Provided",
        nakshatra: data.nakshatra || "Not Provided",
        familyType: data.familyType || "Not Provided",
        siblingCount: data.siblingCount !== "0" ? data.siblingCount : "None",
        educationOfSiblings: data.educationOfSiblings || "Not Provided",
        property: data.property || "Not Provided",
        educationOfMother: data.educationOfMother || "Not Provided",
        educationOfFather: data.educationOfFather || "Not Provided",
        motherFamilyDetails: data.motherFamilyDetails || "Not Provided",
        fatherFamilyDetails: data.fatherFamilyDetails || "Not Provided",
        selectedEducations: data.selectedEducations,
        selectedIncome: data.selectedIncome,
        expectedEatingHabits: data.expectedEatingHabits,
        expectedGana: data.expectedGana,
        expectedLocality: data.expectedLocality,
        expectedNakshatra: data.expectedNakshatra,
        expectedBloodGroups: data.expectedBloodGroups,
        expectedNaadi: data.expectedNaadi,
        expectedRaas: data.expectedRaas,
        expectedHeight: data.expectedHeight || "No bar",
        expectedFamilyType: data.expectedFamilyType,
        selectedSiblingsCousinsUpto:
          data.selectedSiblingsCousinsUpto || "No bar",
        expectedAgeGap:
          data.expectedAgeGapMin && data.expectedAgeGapMax
            ? `${data.expectedAgeGapMin}-${data.expectedAgeGapMax} years`
            : "No bar",
        expectedAgeGapMax: data.expectedAgeGapMax
          ? `${data.expectedAgeGapMax} years`
          : "No bar",
        expectedAgeGapMin: data.expectedAgeGapMin
          ? `${data.expectedAgeGapMin} years`
          : "No bar",
        strictMatch: data.strictMatch ? "Yes" : "No",
        isVerified: data.isVerified,
      };

      if (data.birthDate) {
        const birthMoment = moment(data.birthDate);
        finalData.birthDate = `${birthMoment.format(
          "DD MMMM YYYY"
        )}, ${birthMoment.format("dddd")}`;
      } else {
        finalData.birthDate = "Not Provided";
      }

      finalData.birthTime = data.birthTime
        ? moment(data.birthTime, "HH:mm:ss").format("hh:mm A")
        : "Not Provided";

      const paymentInfo = await PaymentBase.findOne({
        userEmail: req.user.userEmail,
      }).sort({ createdAt: -1 });

      let emailIdString = "Buy Our Services For Contact Information";
      let contactNumberString = "Buy Our Services For Contact Information";
      let paymentPlan = "None";

      const localTimezone = "Asia/Kolkata";
      const now = moment().tz(localTimezone);

      if (paymentInfo) {
        const hasProfile = paymentInfo.savedProfiles.includes(data._id);
        const isApproved =
          paymentInfo.isApproved === true || paymentInfo.isApproved === 1;
        const isValid = moment.utc(paymentInfo.validTill).isAfter(now.utc());

        finalData.isAlreadyAdded = hasProfile;
        if (
          isApproved &&
          isValid &&
          (paymentInfo.profileCount === 0 ||
            paymentInfo.savedProfiles.length <
              parseInt(paymentInfo.profileCount))
        ) {
          paymentPlan = "Active";
        }

        if (hasProfile && isApproved && isValid) {
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
      }

      finalData.userEmail = emailIdString;
      finalData.phoneNumber = contactNumberString;
      finalData.community = data.community;
      finalData.paymentplan = paymentPlan;

      if (data.referenceCode) {
        const adminData = await UserBase.findOne({
          __t: "admin",
          referenceCode: data.referenceCode,
        });
        finalData.referenceName = adminData
          ? `${adminData.firstName} ${adminData.lastName}`
          : "NA";
      } else {
        finalData.referenceName = "NA";
      }
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
          const joined = chunks.map((c) => c.data.toString("base64")).join("");

          return {
            fileId: file._id,
            filename: file.filename,
            contentType: file.contentType,
            length: file.length,
            base64: joined,
          };
        })
      );

      return res
        .status(200)
        .json({ message: "success", data: finalData, media });
    } catch (error) {
      console.error(error);
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
        secure: true, // Use HTTPS (for production)
        sameSite: "None", // Prevent CSRF attacks
        // sameSite: "Lax", // For localhost
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
      console.log(error)
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
    console.log(error)
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
        httpOnly: true, // Prevent access from JavaScript (security)
        secure: true, // Use HTTPS (for production)
        sameSite: "None", // Prevent CSRF attacks
        // sameSite: "Lax", // For localhost
      });
      return res
        .status(200)
        .json({ message: "success", data: "Logged out successfully." });
    } catch (error) {
      console.log(error)
      return res.status(500).json({ message: "failure", data: error.message });
    }
  }
);

commonRoutes.get("/get-districts", async (req, res) => {
  try {
    const disticts = await DistrictMaster.find({ isActive: true }, { _id: 0 });
    return res.status(200).json({ message: "success", data: disticts });
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: "failure", data: error.message });
  }
});

export default commonRoutes;