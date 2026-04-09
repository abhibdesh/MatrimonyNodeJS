import {
  generateKeyPairSync,
  createSign,
  createVerify,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  verify,
} from "crypto";
import User from "../models/UserBase.js";
import crypto from "crypto";


export const createKeys = () => {};

export const signKeys = () => {};

export const verifyKeys = (payload, signatureBase64, publicKeyPem) => {
  const signatureBuffer = Buffer.from(signatureBase64, "base64");

  const isValid = verify(
    "sha256",
    Buffer.from(payload),
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    },
    signatureBuffer
  );

  return isValid;
};

export const encryptPrivateKey = (privateKeyPem, secret) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "hex"), iv);
  let encrypted = cipher.update(privateKeyPem, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
};

export const decryptPrivateKey = (encryptedData, secret) => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secret, "hex"),
    Buffer.from(encryptedData.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));
  let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};
