import UserBase from "./UserBase.js";
import mongoose from "mongoose";


const EncryptedKeySchema = new mongoose.Schema({
  encrypted: { type: String, required: true }, // ciphertext
  iv: { type: String, required: true },        // initialization vector
  authTag: { type: String, required: true },   // auth tag for GCM
});

const AdminSchema = new mongoose.Schema(
  {
    communityList:{type:[String],default:[]},
    percentageShare:{type:Number,default:25.00},
    privateKey:{type:EncryptedKeySchema},
    publicKeyPem:{type:String},
    status: { type: String, default: 'active' },
    approvalsToday: {type : Number, default:0 }
  },
  { _id: false }
);

const Admin = UserBase.discriminator("admin", AdminSchema);

export default Admin;
