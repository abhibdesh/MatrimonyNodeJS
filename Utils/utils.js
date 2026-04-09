import moment from "moment-timezone";
import QRCode from "qrcode";
import crypto from "crypto";

export const PRICING_MATRIX = {
  "1":  { 10: 499, 25: 999, 30: 1299, Unlimited: 1599 },
  "3":  { 10: 899, 25: 1399, 30: 1599, Unlimited: 1999 },
  "6":  { 10: 1299,25: 1699,30: 1999, Unlimited: 2499 },
  "9":  { 10: 1299,25: 1599,30: 1999, Unlimited: 2499 },
  "1Y":{ Unlimited: 4999 }
};

export function calculateAmount(planDuration, profileCount) {
  const plan = PRICING_MATRIX[planDuration];
  if (!plan || plan[profileCount] == null) {
    throw new Error("Invalid planDuration or profileCount");
  }
  return plan[profileCount];
}

export function getValidTill(planDuration){
  
}

export function generateTxnId() {
   const now = moment().tz("Asia/Kolkata").format("YYYYMMDDHHmmss");
   const random = crypto.randomBytes(6).toString("hex"); // 12 chars}
   return `${now}${random}`; 
}

export function buildUpiLink({ transactionId, amount, planDuration, profileCount }) {
  const UPI_ID = process.env.UPI_ID;         
  const NOTE   = `SB:${transactionId}`;
  console.log(planDuration)
  console.log(profileCount)
  const payee  = encodeURIComponent("Alareet Enterprises");
  return `upi://pay?pa=${UPI_ID}&pn=${payee}&tn=${encodeURIComponent(NOTE)}&am=${amount}&cu=INR&tr=${transactionId}`;
}

export async function generateQrImage(upiLink) {
  return QRCode.toDataURL(upiLink, { errorCorrectionLevel: "H" });
}
