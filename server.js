/*
       /        /  /|  /-----  |--|
      /        /  / |  |       |**|
     /___     /  /--|  \----\  |**|
    /    \---/  /   |       |  |**|
   /        /  /    |  -----/  |__|

 Hard to read, like the documentation
  —————— 2026  wikdomain.com ——————
*/

console.log("HASI by wik")
const debug = process.argv.includes('--test')
if (debug) {console.log("IN DEBUG MODE")}

// SETTINGS
const PORT = process.env.PORT || 3000; // Port for Express to listen on
const enableUserNameLookup = true; // Enable user lookup via /user/:username endpoint

// Import stuff and set up hash functions
const express = require("express");
const Database = require("better-sqlite3");
const { getuser } = require('./getId');
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const registerListeners = require("./listeners");

if (process.argv.includes('--create-masterkey')) {
  const masterKey = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(JSON.stringify(["master"]), masterKey);
  console.log(`Master API key created (argument): ${masterKey}`);
}

if (process.argv.includes('--create-masterkey')) {
  const masterKey = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(JSON.stringify(["master"]), masterKey);
  console.log(`Master API key created (argument): ${masterKey}`);
}

const SALT_ROUNDS = 10;
const hash = (value) => bcrypt.hash(value, SALT_ROUNDS);
const compareHash = (value, hashed) => bcrypt.compare(value, hashed);

// Create database, tables, and prepared statements
const db = new Database("./database.sqlite");
db.exec("CREATE TABLE IF NOT EXISTS flagged (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, description TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS apikeys (perms TEXT, key TEXT PRIMARY KEY)");
const insertFlagged = db.prepare("INSERT INTO flagged (uid, description) VALUES (?, ?)");
const getFlagged = db.prepare("SELECT * FROM flagged WHERE uid = ?");
const getApiKeys = db.prepare("SELECT * FROM apikeys");
const markFlagged = db.prepare("UPDATE flagged SET uid = 0, description = '-' WHERE uid = ?");
const updateFlagged = db.prepare("UPDATE flagged SET description = ? WHERE uid = ?");

const findApiKey = async (key) => {
  if (!key) return null;
  const rows = getApiKeys.all();
  for (const row of rows) {
    if (await compareHash(key, row.key)) {
      return row;
    }
  }
  return null;
};

const isMasterKey = async (key) => {
  const apiKeyRow = await findApiKey(key);
  return apiKeyRow ? JSON.parse(apiKeyRow.perms).includes("master") : false;
};

// Check if a master API exists
const masterExists = db.prepare("SELECT * FROM apikeys WHERE perms LIKE '%master%'").get();
if (!masterExists) {
  const masterKey = crypto.randomBytes(32).toString("hex");
  hash(masterKey)
    .then((masterHash) => {
      db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(JSON.stringify(["master"]), masterHash);
      console.log(`Master API key created: ${masterKey}`);
    })
    .catch((err) => {
      console.error("Failed to create master API key:", err);
    });
}

// Middleware to check API key permissions
const checkPerms = (requiredPerm) => {
  return async (req, res, next) => {
    const { key } = req.body;
    if (!key) return res.status(401).json({ error: "API key is required in the request body." });

    const apiKeyRow = await findApiKey(key);
    if (!apiKeyRow) return res.status(401).json({ error: "Invalid API key." });

    try {
      const perms = JSON.parse(apiKeyRow.perms);
      if (perms.includes("master") || perms.includes(requiredPerm)) {
        next();
      } else {
        res.status(403).json({ error: `Missing required permission: ${requiredPerm}` });
      }
    } catch (e) {
      res.status(500).json({ error: "Error parsing API key permissions." });
    }
  };
};

// Create express app
const app = express();
app.use(express.json());
// Catch JSON parse errors from body-parser and return a clean 400
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('Invalid JSON received:', err.message || err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

registerListeners(app, {
  db,
  getFlagged,
  insertFlagged,
  markFlagged,
  updateFlagged,
  checkPerms,
  getuser,
  enableUserNameLookup,
  isMasterKey,
  hash,
});

// V2 Endpoints
app.get("/v2/id/:id", async (req, res) => {
  const { id } = req.params;
  const row = getFlagged.get(id);
  if (row) {
    res.json({ flagged: true, uid: row.uid, description: row.description });
  } else {
    res.status(404).json({ flagged: false });
  }
});

// Start listening to accept requests
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});