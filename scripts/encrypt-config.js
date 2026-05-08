import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const key  = crypto.scryptSync(password, salt, KEY_LENGTH);
  const iv   = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/encrypt-config.js MON_MOT_DE_PASSE");
  process.exit(1);
}

const configPath = path.join(__dirname, "../config/config.json");
const raw = fs.readFileSync(configPath, "utf-8");

// Valide que c'est du JSON correct avant de chiffrer
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("❌ config.json invalide :", e.message);
  process.exit(1);
}

const encrypted = encrypt(JSON.stringify(parsed), password);
console.log("\n✅ Config chiffrée (à coller dans Railway) :\n");
console.log(encrypted);
console.log("\n⚠️  Ne perdez pas votre mot de passe — sans lui, impossible de déchiffrer !\n");