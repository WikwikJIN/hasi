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
// TODO: Debug mode with special commands/endpoints
const debug = process.argv.includes('--test')
if (debug) {console.log("IN DEBUG MODE")}
if (process.env.NODE_ENV === 'production' && debug) { console.warn("WARNING: Debug mode enabled on production env. This may expose sensitive information.") }
if (debug) { console.log(process.argv) }

// SETTINGS
const PORT = process.env.PORT || 3000; // Port for Express to listen on
const enableUserNameLookup = true; // Enable user lookup via /user/:username endpoint
const v2Disabed = true; // Disable v2 endpoints if true

// Import stuff and set up hash functions
const express = require("express");
const Database = require("better-sqlite3");
const { getuser } = require('./getId');
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const registerListeners = require("./listeners");

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

// Create database, tables, and prepared statements
const db = new Database("./database.sqlite");
db.exec("CREATE TABLE IF NOT EXISTS flagged (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, description TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS apikeys (perms TEXT, key TEXT PRIMARY KEY)");
const insertFlagged = db.prepare("INSERT INTO flagged (uid, description) VALUES (?, ?)");
const getFlagged = db.prepare("SELECT * FROM flagged WHERE uid = ?");
const getApiKeys = db.prepare("SELECT * FROM apikeys");
const markFlagged = db.prepare("UPDATE flagged SET uid = 0, description = '-' WHERE uid = ?");
const updateFlagged = db.prepare("UPDATE flagged SET description = ? WHERE uid = ?");
const getBID = db.prepare("SELECT * FROM flagged WHERE id = ?");



let unauthorizedAccess = false;
if (process.argv.includes('--unauthorized-full-access')) {
  if (process.env.NODE_ENV === 'production') {
    console.error("ERROR: Unauthorized full access mode cannot be enabled in production.");
    process.exit(1);
  }
  unauthorizedAccess = true;
  console.warn("WARNING: Unauthorized full access mode enabled. This mode allows for all endpoints to be used without API keys.");
}
if (process.argv.includes('--create-masterkey')) {
  const masterKey = crypto.randomBytes(32).toString("hex");
  const hashed = await hash(masterKey);
  db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(JSON.stringify(["master"]), hashed);
  console.log(`Master API key created (argument): ${masterKey}`);
}

const SALT_ROUNDS = 10;
const hash = (value) => bcrypt.hash(value, SALT_ROUNDS);
const compareHash = (value, hashed) => bcrypt.compare(value, hashed);

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
const checkPerms = (requiredPerm, version = 1) => {
  let key;
  return async (req, res, next) => {
    if (unauthorizedAccess) { next(); };
    if (version === 1) {
      // Use legacy key in body for API version 1
      key = req.body.key;
      console.log("Checking API key for v1:", key);
    } else {
      // For version 2, check the 'x-api-key' header
      console.log("Checking API key for v2:", req.headers["x-api-key"]);
      key = req.headers["x-api-key"];
    }
    if (!key) return res.status(401).json({ error: "API key is required." });

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
  if (v2Disabed === true) { return res.status(400).json({ error: "V2 Disabled" }); }
  const { id } = req.params;
  const row = getFlagged.get(id);
  if (row) {
    res.json({ target: id, flagged: true, bid: row.id, description: row.description });
  } else {
    res.status(404).json({ target: id, flagged: false });
  }
});
app.get("/v2/banid/:bid", async (req, res) => {
  if (v2Disabed === true) { return res.status(400).json({ error: "V2 Disabled" }); }
  const { bid } = req.params;
  const row = getBID.get(bid);
  if (row) {
    res.json({ target: bid, exists: true, uid: row.uid, description: row.description });
  } else {
    res.status(404).json({ target: bid, exists: false });
  }
});
app.post("/v2/flag", checkPerms("write", 2), async (req, res) => {
  if (v2Disabed === true) { return res.status(400).json({ error: "V2 Disabled" }); }
  const { username, uid, description } = req.body;
  if (!description) { return res.status(400).json({ target: uid, success: false }); }
  if (!username && !uid ) { return res.status(400).json({ target: uid, success: false }); }
  try {
      const existing = getFlagged.get(Number(resolvedUid));
      if (existing && existing.uid && existing.uid !== 0) {
        return res.status(409).json({ error: "User is already flagged." });
      }
    insertFlagged.run(uid, description);
    res.status(201).json({ target: uid, success: true });
  } catch (e) {
    console.error("Error inserting flagged user:", e);
    res.status(500).json({ target: uid, success: false });
  }
});

// Start listening to accept requests
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});