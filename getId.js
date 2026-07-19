// HASI: Hacker account slaying initiative - Get UID script
async function getUserIds(usernames) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames, excludeBannedUsers: false }),
  });

  const data = await res.json();
  return data.data; // array of { id, name, displayName }
}

// Simple exported wrapper for external use
async function getuser(usernames) {
  return getUserIds(usernames);
}

module.exports = { getuser };

// If run directly, demonstrate usage
if (require.main === module) {
  (async function main() {
    try {
      const users = await getuser(["Builderman", "Roblox"]);
      console.log(users);
    } catch (err) {
      console.error(err);
    }
  })();
}