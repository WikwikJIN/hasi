const { response } = require("express");

const globalSessionToken = "fdd71b87d0d0f700cfd5a3717e960dcd7bea98bede7a8e4fcd862b3ac38fbfdf";

async function changedisplayname(name) {
  const displayName = "Wik";
  const userId = 3;
  const sessionToken = globalSessionToken;

  if (!sessionToken || !userId) {
    console.log("Error");
    return;
  }

  const response = await fetch(`http://localhost:3000/session/account/changedisplayname`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionToken: sessionToken,
      userId: userId,
      displayName: displayName
    }),
  });
  return response;
}
async function main() {
  const result = await changedisplayname("son");
  console.log(result);
  console.log(result.status);
}
main();