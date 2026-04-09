import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";

const DistrictMasterSchema = new mongoose.Schema(
  {
    stateName: { type: String },
    cityName: { type: String },
    isActive: { type: Boolean },
  },
  {collection: "DistrictMaster" }

);

const DistrictMaster = sutabandhanConnection.model("DistrictMaster", DistrictMasterSchema);

export default DistrictMaster;