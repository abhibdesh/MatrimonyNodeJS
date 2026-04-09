import mongoose from "mongoose";
import { sutabandhanConnection } from "../dbConnections.js";

const MenuMasterSchema = new mongoose.Schema(
  {
    displayName: { type: String },
    path: { type: String },
    __t: { type: [String], default:["owner"]},
    priority: {type: Number},
    isActive :{type:Boolean,default:true}
  },
  { timestamps: true, collection: "MenuMaster" }
);

const MenuMaster = sutabandhanConnection.model("MenuMaster", MenuMasterSchema);

export default MenuMaster;