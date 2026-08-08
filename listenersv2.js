// HASI - V2 Listeners
module.exports = function registerV2Listeners(app, deps) {
  const { getFlagged, getBID, insertFlagged, checkPerms, v2Disabed } = deps;

  const blockV2 = (res) => {
    if (v2Disabed === true) {
      res.status(400).json({ error: "V2 Disabled" });
      return true;
    }
    return false;
  };

  app.get("/v2/id/:id", checkPerms("read", 2), async (req, res) => {
    if (blockV2(res)) return;
    const { id } = req.params;
    const row = getFlagged.get(id);
    if (row) {
      res.json({ target: id, flagged: true, bid: row.id, description: row.description });
    } else {
      res.status(404).json({ target: id, flagged: false });
    }
  });

  app.get("/v2/banid/:bid", checkPerms("read", 2), async (req, res) => {
    if (blockV2(res)) return;
    const { bid } = req.params;
    const row = getBID.get(bid);
    if (row) {
      res.json({ target: bid, exists: true, uid: row.uid, description: row.description });
    } else {
      res.status(404).json({ target: bid, exists: false });
    }
  });

  app.post("/v2/flag", checkPerms("write", 2), async (req, res) => {
    if (blockV2(res)) return;
    const { uid, description } = req.body;
    if (!description || !uid) {
      return res.status(400).json({ target: uid, success: false });
    }

    try {
      const resolvedUid = Number(uid);
      const existing = getFlagged.get(resolvedUid);
      if (existing && existing.uid && existing.uid !== 0) {
        return res.status(409).json({ error: "User is already flagged." });
      }

      insertFlagged.run(resolvedUid, description);
      res.status(201).json({ target: resolvedUid, success: true });
    } catch (e) {
      console.error("Error inserting flagged user:", e);
      res.status(500).json({ target: uid, success: false });
    }
  });

  app.patch("/v2/flag/", checkPerms("modify", 2), async (req, res) => {
    if (blockV2(res)) return;
    const { uid, description } = req.body;
    if (!uid || !description) {
      return res.status(400).json({ target: uid, success: false });
    }
  });
};
