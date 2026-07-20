const crypto = require("node:crypto");

module.exports = function registerListeners(app, deps) {
  const {
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
  } = deps;

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
    const { username, uid, description } = req.body;
    if (!description) return res.status(400).json({ error: "description is required." });
    if (!username && !uid) return res.status(400).json({ error: "username or uid is required." });

    try {
      let resolvedUsername = username;
      let resolvedUid = uid;

      if (!resolvedUid && username) {
        const users = await getuser([username]);
        if (!users || users.length === 0) {
          return res.status(404).json({ error: "User not found." });
        }
        resolvedUid = users[0].id;
      }

      if (!resolvedUid) {
        return res.status(400).json({ error: "Unable to resolve the target user." });
      }

      const existing = getFlagged.get(Number(resolvedUid));
      if (existing && existing.uid && existing.uid !== 0) {
        return res.status(409).json({ error: "User is already flagged." });
      }

      insertFlagged.run(Number(resolvedUid), description);
      res.status(201).json({ message: "User flagged successfully.", uid: Number(resolvedUid) });
      console.log(`✅ User ${resolvedUsername || resolvedUid} (ID: ${resolvedUid}) flagged by ${req.ip}: ${description}`);
      console.log(`Short: ✅ Added ${resolvedUsername || resolvedUid} to flagged list, Description: ${description}`);
    } catch (error) {
      console.error(`Error flagging user ${username || uid}: ${error}`);
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
    if (!enableUserNameLookup) {
      return res.status(403).json({ message: "User lookup is disabled." });
    }
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
  });

  app.get("/teapot", (req, res) => {
    res.status(200).json({ message: "AVAILABLE OPTIONS, ONE OF THEM ARE VALID: coffee, tea, cocoa, cocacola, 7up, sprite, fanta, blended-glass-with-milk" });
  });

  app.get("/teapot/:drink", (req, res) => {
    if (req.params.drink !== "tea") {
      res.status(418).json({ message: "I'm a teapot. Please specify a valid drink." });
    } else {
      res.status(202).json({ message: "Making tea... ETA: When i want to" });
    }
  });
};
