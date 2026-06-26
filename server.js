// —————————————  HASI —————————————
// Hacker account slaying initiative
// —————— 2026  wikdomain.com ——————

console.log("HASI by wik")
const debug = process.argv.includes('--test')
if (debug) {console.log("IN DEBUG MODE")}

// Import stuff
const express = require("express");
const Database = require("better-sqlite3");
const { getuser } = require('./getId');
const crypto = require("crypto");
const bcrypt = require("bcrypt");

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
const PORT = process.env.PORT || 3000;

app.get("/id/:uid", (req, res) => {
  console.log(`Request from ${req.ip} for UID: ${req.params.uid}`);
  const row = getFlagged.get(req.params.uid);
  if (row) {
    res.json(row);
    console.log(`✅ Sent flagged entry for user ID ${req.params.uid} to ${req.ip}`);
  } else {
    res.status(200).json({ message: "No flagged entries found for this user." });
    console.log(`✅ No flagged entries found for user ID ${req.params.uid} requested by ${req.ip}`);
  }
});

app.post("/flag", checkPerms("write"), async (req, res) => {
  const { username, description, key } = req.body;
  if (!username || !description) return res.status(400).json({ error: "username and description are required." });

  try {
    const users = await getuser([username]);
    if (!users || users.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const uid = users[0].id;
    // Prevent duplicate flagged entries: if a non-deleted row exists for this uid, reject
    const existing = getFlagged.get(uid);
    if (existing && existing.uid && existing.uid !== 0) {
      return res.status(409).json({ error: "User is already flagged." });
    }
    insertFlagged.run(uid, description);
    res.status(201).json({ message: "User flagged successfully.", uid: uid });
    console.log(`✅ User ${username} (ID: ${uid}) flagged by ${req.ip}: ${description}`);
    console.log(`Short: ✅ Added ${username} to flagged list, Description: ${description}`);
  } catch (error) {
    console.error(`Error flagging user ${username}: ${error}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/flag/:uid", checkPerms("delete"), (req, res) => {
  const { uid } = req.params;
  const result = markFlagged.run(uid);

  if (result.changes > 0) {
    res.json({ message: "User marked removed (uid set to 0)." });
    console.log(`✅ User ${uid} marked removed (uid=0) by ${req.ip}`);
  } else {
    res.status(404).json({ error: "User not found in flagged list." });
  }
});

app.get("/user/:username", async (req, res) => {
  console.log(`Request from ${req.ip} for username: ${req.params.username}`);
  try {
    const users = await getuser([req.params.username]);

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const userId = users[0].id;
    console.log(`Fetched user ID for username ${req.params.username}: ${userId}`);

    const row = getFlagged.get(userId);
    if (row) {
      res.json(row);
      console.log(`✅ Sent flagged entry for user ID ${userId} to ${req.ip}`);
    } else {
      res.status(200).json({ message: "No flagged entries found for this user." });
      console.log(`✅ No flagged entries found for user ID ${userId} requested by ${req.ip}`);
    }
  } catch (error) {
    console.error(`Error fetching user ${req.params.username}: ${error}`);
    res.status(500).json({ message: "Internal server error" });
  }
});
app.get("/count", (req, res) => {
  const count = db.prepare("SELECT count(*) AS count FROM flagged WHERE uid <> 0;").get();
  res.json({ count: count.count });
});
app.patch("/flag/:uid", checkPerms("modify"), (req, res) => {
  const { uid } = req.params;
  const { description } = req.body;

  if (!description) {
    return res.status(400).json({ error: "Description is required." });
  }

  const result = updateFlagged.run(description, uid);
  if (result.changes > 0) {
    res.json({ message: "Flagged entry updated successfully." });
    console.log(`✅ Flagged entry for user ID ${uid} updated by ${req.ip}: ${description}`);
  } else {
    res.status(404).json({ error: "Flagged entry not found." });
  }
});
app.post("/apikey", checkPerms("master"), async (req, res) => {
  const { perms } = req.body;

  if (!perms) {
    return res.status(400).json({ error: "Permissions are required." });
  }

  const key = crypto.randomBytes(32).toString("hex");
  const hashedKey = await hash(key);
  db.prepare("INSERT INTO apikeys (perms, key) VALUES (?, ?)").run(JSON.stringify(perms), hashedKey);

  res.json({ message: "API key created successfully.", key });
});
app.get("/ismaster", async (req, res) => {
  const { key } = req.query;
  const master = await isMasterKey(key);
  res.json({ message: master });
})
// Easter egg
app.get("/teapot", (req, res) => {
  res.status(200).json({ message: "AVIABLE OPTIONS, ONE OF THEM ARE VALID: coffee, tea, cocoa, cocacola, 7up, sprite, fanta, blended-glass-with-milk" });
});
app.get("/teapot/:drink", (req, res) => {
  if (req.params.drink !== "tea") {
    res.status(418).json({ message: "I'm a teapot. Please specify a valid drink." });
  } else {
    res.status(202).json({ message: "Making tea... ETA: When i want to" });
  }
});


// Start listening to accept requests
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});