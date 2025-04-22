import UserBase from "./UserBase.js";
import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    communityList:{type:[String],default:[]},
    percentageShare:{type:Number,default:20.00}
  },
  { _id: false }
);

const Admin = UserBase.discriminator("admin", AdminSchema);

export default Admin;
