import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../data/snapshots.json");

// Crée le dossier data si inexistant
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// Lire les snapshots
app.get("/api/snapshots", (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) return res.json([]);
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

// Sauvegarder les snapshots
app.post("/api/snapshots", (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3001, () => console.log("📦 Snapshot server running on http://localhost:3001"));


//deyption function

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function decrypt(encryptedBase64, password) {
  const buf  = Buffer.from(encryptedBase64, "base64");
  const salt = buf.slice(0, 16);
  const iv   = buf.slice(16, 28);
  const tag  = buf.slice(28, 44);
  const data = buf.slice(44);
  const key  = crypto.scryptSync(password, salt, KEY_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

// Au démarrage du serveur
const ENCRYPTED_CONFIG = process.env.PORTFOLIO_CONFIG_ENCRYPTED;
const CONFIG_PASSWORD   = process.env.CONFIG_PASSWORD;

let config;
try {
  config = JSON.parse(decrypt(ENCRYPTED_CONFIG, CONFIG_PASSWORD));
  console.log("✅ Config déchiffrée avec succès");
} catch {
  console.error("❌ Impossible de déchiffrer la config — vérifiez les variables d'environnement");
  process.exit(1);
}