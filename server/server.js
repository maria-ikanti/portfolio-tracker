import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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