import mongoose from "mongoose";

const DistrictMasterSchema = new mongoose.Schema(
  {
    stateName: { type: String },
    cityName: { type: String },
    isActive: { type: Boolean },
  },
  {collection: "DistrictMaster" }

);

const DistrictMaster = mongoose.model("DistrictMaster", DistrictMasterSchema);

export default DistrictMaster;