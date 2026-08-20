/*      __       __  __           __
       / /      / / /| |  /----- |--|
      / /      / / / | | |       |*.|
     /_ \_____/ / /--| | \----\  |**|
    / /\_____/ / /   | |      |  |**|
   /_/      /_/ /    |_| _____/  |__|
 Hard to read, like the documentation
  —————— 2026  wikdomain.com ——————
*/

console.log("HASI by wik");
// TODO: Debug mode with special commands/endpoints
const debug = process.argv.includes("--test");
if (debug) {
  console.log("IN DEBUG MODE");
}
if (process.argv.NODE_ENV === "production" && debug) {
  console.warn(
    "WARNING: Debug mode enabled on production env. This may expose sensitive information.",
  );
}
console.log("SETUP: Loading .env variables...");
require("dotenv").config();
// SETTINGS
console.log("SETUP: Loading settings...");
const PORT = process.env.PORT || 3000; // Port for Express to listen on
const enableUserNameLookup = true; // Enable user lookup via /user/:username endpoint
const domain = process.env.DOMAIN || "*"; // Domain for CORS and other purposes
const readingNeedsAPIKey = false; // Require API key for user-reading endpoints (ex. GET /user/:username)
// Feature flags for endpoint management
const enabledApiKeyManagement =
  process.env.ENABLED_API_KEY_MANAGEMENT !== "false"; // Enable v1 endpoints and API key management
const enabledUserSessionManagement =
  process.env.ENABLED_USER_SESSION_MANAGEMENT !== "false"; // Enable session-based endpoints
const v2Disabled = process.env.V2_DISABLED === "true" || true; // Disable v2 endpoints if true. Disabled by default because it is unfinished

// Import stuff and set up hash functions
console.log("SETUP: Importing modules...");
const express = require("express");
const Database = require("better-sqlite3");
const { getuser } = require("./getId");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const registerListeners = require("./listeners");
const registerV2Listeners = require("./listenersv2");
let wasMasterKeyNotThere = false;
const cors = require("cors");
const { rateLimit } = require('express-rate-limit');
const { error } = require("node:console");
console.log("SETUP: Loading Express...");
// Create express app
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: domain,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
); // Enable CORS
// Rate limiting middleware
const limiter = rateLimit({
  message: { success: false, error: 'Too many requests, please try again later.', code: 'ratelimit' },
  windowMs: 1 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ipv6Subnet: 56,
})
app.use("/session/gettoken", limiter);
// Catch JSON parse errors from body-parser and return a clean 400
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    console.error("Invalid JSON received:", err.message || err);
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next(err);
});

console.log("SETUP: Loading database...");
// Create database, tables, and prepared statements
const db = new Database("./database.sqlite");
db.exec(
  "CREATE TABLE IF NOT EXISTS flagged (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, description TEXT)",
);
db.exec(
  "CREATE TABLE IF NOT EXISTS apikeys (perms TEXT, key TEXT PRIMARY KEY)",
);

// Raw and other prepared statements
const insertFlagged = db.prepare("INSERT INTO flagged (uid, description) VALUES (?, ?)",);
const getFlagged = db.prepare("SELECT * FROM flagged WHERE uid = ?");
const getApiKeys = db.prepare("SELECT * FROM apikeys");
const markFlagged = db.prepare("UPDATE flagged SET uid = 0, description = '-' WHERE uid = ?",);
const updateFlagged = db.prepare("UPDATE flagged SET description = ? WHERE uid = ?",);
const getBID = db.prepare("SELECT * FROM flagged WHERE id = ?");

// ! --------------------------- SETUP END --------------------------- ! \\
const SALT_ROUNDS = 10;
const hash = (value) => bcrypt.hash(value, SALT_ROUNDS);
const compareHash = (value, hashed) => bcrypt.compare(value, hashed);
const cryptoHash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const compareCryptoHash = (value, hashed) => cryptoHash(value) === hashed;
const generateRandomKey = (length = 64) =>
  crypto.randomBytes(length).toString("hex");
const blockV2 = (req, res, next) => {
  if (v2Disabled) {
    return res.status(400).json({ error: "V2 Disabled" });
  }
  next();
};
const blockV1 = (req, res, next) => {
  if (!enabledApiKeyManagement) {
    return res.status(400).json({ error: "V1 Disabled" });
  }
  next();
};
const blockSession = (req, res, next) => {
  if (!enabledUserSessionManagement) {
    return res.status(400).json({ success: false, error: "Session Disabled" });
  }
  next();
};
function newMaster() {
  const masterKey = crypto.randomBytes(32).toString("hex");
  hash(masterKey)
    .then((masterHash) => {
      db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(
        JSON.stringify(["master"]),
        masterHash,
      );
      console.log(`Master API key created: ${masterKey}`);
    })
    .catch((err) => {
      console.error("Failed to create master API key:", err);
    });
}

let unauthorizedAccess = false;
if (process.argv.includes("--unauthorized-full-access")) {
  if (process.argv.NODE_ENV === "production") {
    console.error(
      "ERROR: Unauthorized full access mode cannot be enabled in production.",
    );
    process.exit(1);
  }
  unauthorizedAccess = true;
  console.warn(
    "WARNING: Unauthorized full access mode enabled. This mode allows for all endpoints to be used without API keys.",
  );
}

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
const masterExists = db
  .prepare("SELECT * FROM apikeys WHERE perms LIKE '%master%'")
  .get();
if (!masterExists) {
  console.log("No master API key found, creating...");
  newMaster();
  wasMasterKeyNotThere = true;
}

if (process.argv.includes("--create-masterkey")) {
  if (wasMasterKeyNotThere) {
    console.warn(
      "Master key was already created at startup, skipping creation.",
    );
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
        res
          .status(403)
          .json({ error: `Missing required permission: ${requiredPerm}` });
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
  blockV1,
});

registerV2Listeners(app, {
  getFlagged,
  getBID,
  insertFlagged,
  checkPerms,
  v2Disabled,
});
