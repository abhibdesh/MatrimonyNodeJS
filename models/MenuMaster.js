import mongoose from "mongoose";

const MenuMasterSchema = new mongoose.Schema(
  {
    displayName: { type: String },
    path: { type: String },
    __t: { type: String },
    priority: {type: Number}
  },
  { timestamps: true, collection: "MenuMaster" }
);

const MenuMaster = mongoose.model("MenuMaster", MenuMasterSchema);

export default MenuMaster;