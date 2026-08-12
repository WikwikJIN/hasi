/*
       /        /  /|  /-----  |--|
      /        /  / |  |       |*.|
     /___     /  /--|  \----\  |**|
    /    \___/  /   |       |  |**|
   /        /  /    |  _____/  |__|
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
const v2Disabled = process.env.V2_DISABLED === "true"; // Disable v2 endpoints if true

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
// Session-based setup
db.exec(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, display_name TEXT, profile_picture TEXT, perms TEXT, password TEXT, is_banned BOOLEAN DEFAULT 0)",
);
db.exec(
  "CREATE TABLE IF NOT EXISTS sessions (for_user INTEGER, session_token TEXT PRIMARY KEY, expires_at DATETIME)",
);
const user = {
  tokenttlmin: 10,
  create: db.prepare(
    "INSERT INTO users (username, display_name, profile_picture, perms, password, is_banned) VALUES (?, ?, 'default', ?, ?,0)",
  ),
  getByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  getById: db.prepare("SELECT * FROM users WHERE id = ?"),
  update: db.prepare(
    "UPDATE users SET username = ?, display_name = ?, profile_picture = ?, perms = ?, password = ?, is_banned = ? WHERE id = ?",
  ),
  delete: db.prepare("DELETE FROM users WHERE id = ?"),
  list: db.prepare("SELECT * FROM users"),
  getPassword: db.prepare("SELECT password FROM users WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password = ? WHERE id = ?"),
  setBanStatus: db.prepare("UPDATE users SET is_banned = ? WHERE id = ?"),
  getBanStatus: db.prepare("SELECT is_banned FROM users WHERE id = ?"),
  getSession: db.prepare("SELECT * FROM sessions WHERE session_token = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE session_token = ?"),
  deleteExpiredSessions: db.prepare(
    "DELETE FROM sessions WHERE expires_at < ?",
  ),
  addSession: db.prepare(
    "INSERT INTO sessions (for_user, session_token, expires_at) VALUES (?, ?, ?)",
  ),
  getUserBySession: db.prepare(
    "SELECT u.* FROM users u JOIN sessions s ON u.id = s.for_user WHERE s.session_token = ? AND s.expires_at > ?",
  ),
  updateSessionExpiry: db.prepare(
    "UPDATE sessions SET expires_at = ? WHERE session_token = ?",
  ),
  listSessions: db.prepare("SELECT * FROM sessions"),
  deleteAllSessionsForUser: db.prepare(
    "DELETE FROM sessions WHERE for_user = ?",
  ),
};

// Raw and other prepared statements
const insertFlagged = db.prepare(
  "INSERT INTO flagged (uid, description) VALUES (?, ?)",
);
const getFlagged = db.prepare("SELECT * FROM flagged WHERE uid = ?");
const getApiKeys = db.prepare("SELECT * FROM apikeys");
const markFlagged = db.prepare(
  "UPDATE flagged SET uid = 0, description = '-' WHERE uid = ?",
);
const updateFlagged = db.prepare(
  "UPDATE flagged SET description = ? WHERE uid = ?",
);
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
const adminExists = db
  .prepare("SELECT * FROM users WHERE perms LIKE '%admin%'")
  .get();
if (!adminExists) {
  console.log("No admin user found, creating default admin user...");
  user.create.run(
    "admin",
    "Admin",
    JSON.stringify(["admin"]),
    cryptoHash("adminpassword"),
  );
  console.warn(
    "Default admin user created with username 'admin' and password 'adminpassword'. Please change the password immediately.",
  );
}
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

// Middleware to validate session token
const validateSession = (req, res, next) => {
  const { sessionToken, userId } = req.body;

  if (!sessionToken)
    return res
      .status(400)
      .json({ success: false, error: "Session token is required." });

  if (!userId)
    return res
      .status(400)
      .json({ success: false, error: "User ID is required." });

  const sessionRow = user.getSession.get(sessionToken);
  if (!sessionRow)
    return res
      .status(401)
      .json({ success: false, error: "Invalid session token." });

  if (sessionRow.for_user != userId)
    return res
      .status(401)
      .json({ success: false, error: "Invalid session token." });

  // Attach session info to request for use in route handlers
  req.sessionData = { userId, sessionToken, session: sessionRow };
  next();
};

// Middleware to check user permissions
const checkSessionPerms = (requiredPerm) => {
  return (req, res, next) => {
    if (!req.sessionData)
      return res
        .status(401)
        .json({ success: false, error: "Session data not found." });

    const userId = req.sessionData.userId;
    const userRow = user.getById.get(userId);

    if (!userRow)
      return res.status(404).json({ success: false, error: "User not found." });

    try {
      const perms = JSON.parse(userRow.perms);
      if (perms.includes("admin") || perms.includes(requiredPerm)) {
        next();
      } else {
        res.status(403).json({
          success: false,
          error: `Missing required permission: ${requiredPerm}`,
        });
      }
    } catch (e) {
      res
        .status(500)
        .json({ success: false, error: "Error parsing user permissions." });
    }
  };
};

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
// Session-based endpoints
app.post("/session/gettoken/:uid", blockSession, async (req, res) => {
  let { password } = req.body;
  password = cryptoHash(password);
  if (!password)
    return res
      .status(400)
      .json({ success: false, error: "Password is required." });
  const userRow = user.getById.get(req.params.uid);
  if (!userRow)
    return res.status(404).json({ success: false, error: "User not found." });
  if (user.getPassword.get(req.params.uid).password === password) {
    const sessionToken = generateRandomKey(32);
    const expiresAt = new Date(Date.now() + user.tokenttlmin * 60 * 1000);
    console.log(
      "SESSION: Session token generated for user:",
      req.params.uid,
      "expires at:",
      expiresAt,
    );
    await user.addSession.run(
      req.params.uid,
      sessionToken,
      expiresAt.toISOString(),
    );
    res.json({ success: true, sessionToken, expiresAt });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials." });
  }
});
app.post("/session/usertoid", blockSession, async (req, res) => {
  console.log(
    `SESSION: Request from ${req.ip}, asking for id of username: ${req.body.username}`,
  );
  const { username } = req.body;
  if (!username)
    return res
      .status(400)
      .json({ success: false, error: "Username is required." });
  const userRow = user.getByUsername.get(username);
  if (!userRow)
    return res.status(404).json({ success: false, error: "User not found." });
  res.json({ success: true, userId: userRow.id });
});
app.get("/session/idtouser/:uid", blockSession, async (req, res) => {
  console.log(
    `SESSION: request from ${req.ip}, asking for username of id: ${req.params.uid}`,
  );
  const { uid } = req.params;
  const userRow = user.getById.get(uid);
  if (!userRow)
    return res.status(404).json({ success: false, error: "User not found." });
  res.json({ success: true, username: userRow.username });
});
app.post(
  "/session/validate",
  blockSession,
  validateSession,
  async (req, res) => {
    console.log(
      `SESSION: Request from ${req.ip}, that validated token of: ${req.sessionData.userId}`,
    );
    res.json({
      success: true,
      userId: req.sessionData.userId,
      expiresAt: req.sessionData.session.expires_at,
    });
  },
);
app.post("/session/extend", blockSession, validateSession, async (req, res) => {
  console.log(
    `SESSION: Request from ${req.ip}, that extended token time for user: ${req.sessionData.userId}`,
  );
  const { sessionToken } = req.sessionData;
  const newExpiresAt = new Date(Date.now() + user.tokenttlmin * 60 * 1000); // Extend by 1 hour
  await user.updateSessionExpiry.run(newExpiresAt.toISOString(), sessionToken);
  res.json({ success: true, expiresAt: newExpiresAt.toISOString() });
});
app.post(
  "/session/sessiontime",
  blockSession,
  validateSession,
  async (req, res) => {
    console.log(
      `SESSION: Request from ${req.ip}, that got token time for user: ${req.sessionData.userId}`,
    );
    const { sessionToken } = req.sessionData;
    const expiresAt = user.getSession.get(sessionToken);
    res.json({ success: true, expiresAt: expiresAt.expires_at });
  },
);
app.post(
  "/session/deletecurrent",
  blockSession,
  validateSession,
  async (req, res) => {
    console.log(
      `SESSION: Request from ${req.ip}, that destroyed token of user: ${req.sessionData.userId}`,
    );
    const { sessionToken, userId } = req.sessionData;

    await user.deleteSession.run(sessionToken);

    res.json({
      success: true,
      message: "Current session token deleted.",
      userId,
    });
  },
);
app.post(
  "/session/deleteall",
  blockSession,
  validateSession,
  async (req, res) => {
    console.log(
      `SESSION: Request from ${req.ip}, that deleted all tokens of user: ${req.sessionData.userId}`,
    );
    const { userId } = req.sessionData;
    await user.deleteAllSessionsForUser.run(userId);
    res.json({ success: true, message: "All sessions deleted." });
  },
);
app.post(
  "/session/change/",
  blockSession,
  validateSession,
  async (req, res) => {
    console.log(`SESSION: Request from ${req.ip}, that made changes to stats.`);
    const { userId } = req.sessionData;
    const row = user.getById.get(userId);
    let {
      username,
      display_name,
      profile_picture,
      perms,
      password,
      is_banned,
    } = row;
    if (req.body.username) {
      const row2 = user.getByUsername.get(req.body.username);
      if (row2 && row2.id !== row.id) {
        return res
          .status(409)
          .json({ success: false, message: "Username conflict" });
      }
      if (/[^A-Za-z0-9]/.test(req.body.username)) {
        return res
          .status(200)
          .json({ success: false, message: "Bad username" });
      } else {
        username = req.body.username;
      }
    }
    if (req.body.displayName) {
      if (req.body.displayName.length > 25 || req.body.displayName.length < 3) {
        console.log('name: ' + req.body.displayName)
        return res
          .status(400)
          .json({ success: false, message: "Bad display name" });
      } else {
        display_name = req.body.displayName;
      }
    }
    if (req.body.profilePicture) {
      profile_picture = req.body.profilePicture;
    }
    try {
      user.update.run(
        username,
        display_name,
        profile_picture,
        perms,
        password,
        is_banned,
        req.sessionData.userId
      );
      return res.status(200).json({ success: true, message: "Applied." });
    } catch (err) {
      console.error(`Failed to apply user(${userId}) settings: ${err}`);
      return res
        .status(500)
        .json({ success: false, message: "Server-side error" });
    }
  },
);
app.post(
  "/session/mystats",
  blockSession,
  validateSession,
  async (req, res) => {
    const { userId } = req.sessionData;
    const userRow = user.getById.get(userId);
    res.json({
      success: true,
      userId: userRow.id,
      username: userRow.username,
      displayName: userRow.display_name,
      profilePicture: userRow.profile_picture,
      perms: JSON.parse(userRow.perms),
      isBanned: userRow.is_banned,
    });
  },
);
setInterval(() => {
  console.log("SESSION: Deleting expired sessions");
  const now = new Date().toISOString();
  user.deleteExpiredSessions.run(now);
}, 60000); // Run every 60 seconds

// Start listening to accept requests
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
