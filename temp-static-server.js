// TEMPORARY — delete this file once you're done debugging.
// Serves webclientbeta/ as plain static files, no live-reload, no injected
// scripts. Uses the same express dependency already installed in hasi's
// node_modules, so nothing new to install if this file lives in hasi/.
const express = require("express");
const path = require("node:path");

const app = express();
const PORT = process.env.STATIC_PORT || 5500;

// webclientbeta/ is a sibling of this file when placed at hasi/ root
const staticDir = path.join(__dirname, "webclientbeta");

app.use(express.static(staticDir));

app.listen(PORT, () => {
  console.log(`Serving ${staticDir} at http://localhost:${PORT}/`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard/`);
  console.log("No live-reload, no injected scripts — plain static serving.");
});
