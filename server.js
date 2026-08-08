/*
       /        /  /|  /-----  |--|
      /        /  / |  |       |**|
     /___     /  /--|  \----\  |**|
    /    \___/  /   |       |  |**|
   /        /  /    |  _____/  |__|
 Hard to read, like the documentation
  —————— 2026  wikdomain.com ——————
*/

console.log("HASI by wik")
// TODO: Debug mode with special commands/endpoints
const debug = process.argv.includes('--test')
if (debug) { console.log("IN DEBUG MODE") }
if (process.argv.NODE_ENV === 'production' && debug) { console.warn("WARNING: Debug mode enabled on production env. This may expose sensitive information.") }
require("dotenv").config();
// SETTINGS
const PORT = process.env.PORT || 3000; // Port for Express to listen on
const enableUserNameLookup = true; // Enable user lookup via /user/:username endpoint
const v2Disabed = true; // Disable v2 endpoints if true
const readingNeedsAPIKey = false; // Require API key for user-reading endpoints (ex. GET /user/:username)
// Control ther 2 database management methods.
const enabledApiKeyManagement = true; // Enable API key management endpoints (create, delete, list)
const enabledUserSessionManagement = true; // Enable the user session system
// Import stuff and set up hash functions
const express = require("express");
const Database = require("better-sqlite3");
const { getuser } = require('./getId');
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const registerListeners = require("./listeners");
const registerV2Listeners = require("./listenersv2");
let wasMasterKeyNotThere = false;

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

const SALT_ROUNDS = 10;
const hash = (value) => bcrypt.hash(value, SALT_ROUNDS);
const compareHash = (value, hashed) => bcrypt.compare(value, hashed);

// Create database, tables, and prepared statements
const db = new Database("./database.sqlite");
db.exec("CREATE TABLE IF NOT EXISTS flagged (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, description TEXT)");
db.exec("CREATE TABLE IF NOT EXISTS apikeys (perms TEXT, key TEXT PRIMARY KEY)");
// Session-based setup
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, display_name TEXT, profile_picture TEXT, perms TEXT, password TEXT, is_banned BOOLEAN DEFAULT 0)");
const user = {
  create: db.prepare("INSERT INTO users (username, display_name, profile_picture, perms, password, is_banned) VALUES (?, ?, 'default', ?, ?,0)"),
  getByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  getById: db.prepare("SELECT * FROM users WHERE id = ?"),
  update: db.prepare("UPDATE users SET display_name = ?, profile_picture = ?, perms = ?, password = ?, is_banned = ? WHERE id = ?"),
  delete: db.prepare("DELETE FROM users WHERE id = ?"),
  list: db.prepare("SELECT * FROM users"),
  getPassword: db.prepare("SELECT password FROM users WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password = ? WHERE id = ?"),
  setBanStatus: db.prepare("UPDATE users SET is_banned = ? WHERE id = ?"),
  getBanStatus: db.prepare("SELECT is_banned FROM users WHERE id = ?"),
}


// Raw and other prepared statements
const insertFlagged = db.prepare("INSERT INTO flagged (uid, description) VALUES (?, ?)");
const getFlagged = db.prepare("SELECT * FROM flagged WHERE uid = ?");
const getApiKeys = db.prepare("SELECT * FROM apikeys");
const markFlagged = db.prepare("UPDATE flagged SET uid = 0, description = '-' WHERE uid = ?");
const updateFlagged = db.prepare("UPDATE flagged SET description = ? WHERE uid = ?");
const getBID = db.prepare("SELECT * FROM flagged WHERE id = ?");
// ! --------------------------- SETUP END --------------------------- ! \\
function blockV2() { if (v2Disabed === true) { return res.status(400).json({ error: "V2 Disabled" }); }}
function newMaster() {
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

let unauthorizedAccess = false;
if (process.argv.includes('--unauthorized-full-access')) {
  if (process.argv.NODE_ENV === 'production') {
    console.error("ERROR: Unauthorized full access mode cannot be enabled in production.");
    process.exit(1);
  }
  unauthorizedAccess = true;
  console.warn("WARNING: Unauthorized full access mode enabled. This mode allows for all endpoints to be used without API keys.");
}
// Pray to God this won't crash servers because of the database scale.
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
  console.log("No master API key found, creating...")
  newMaster();
  wasMasterKeyNotThere = true;
}

if (process.argv.includes('--create-masterkey')) {
  if (wasMasterKeyNotThere) {
    console.warn("Master key was already created at startup, skipping creation.");
  } else {
    newMaster();
  }
}

// Middleware to check API key permissions
const checkPerms = (requiredPerm, version = 1) => {
  let key;
  return async (req, res, next) => {
    if (!readingNeedsAPIKey) next();
    if (unauthorizedAccess) next();
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

// Load v1 endpoints from listeners.js
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

registerV2Listeners(app, {
  getFlagged,
  getBID,
  insertFlagged,
  checkPerms,
  v2Disabed,
});

// Start listening to accept requests
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});