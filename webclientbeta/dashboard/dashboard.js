// Check if a session token exists in localStorage
const sessionToken = localStorage.getItem("HASIWEBCLIENT-sessionToken");
const userId = localStorage.getItem("HASIWEBCLIENT-userId");
const configButton = document.getElementById("config-button");
const configDialog = document.getElementById("dialog");
const extendButton = document.getElementById("extend-button");
const logOutPopup = document.getElementById("logout-popup");
const logoutPopupT = document.getElementById("logout-popup-confirmT");
const logoutPopupF = document.getElementById("logout-popup-confirmF");
const logoutButton = document.getElementById("logout-button");
const sessionTime = document.getElementById("session-time");
const dialogAccount = document.getElementById("dialog-account");
const accountPopup = document.getElementById("account-popup");
const accountPopupApply = document.getElementById("account-popup-apply");
const accountPopupCancel = document.getElementById("account-popup-cancel");
const accountPopupUsername = document.getElementById("account-popup-username");
const accountPopupUsernameChars = document.getElementById(
  "account-popup-username-chars",
);
const accountPopupDisplayName = document.getElementById("account-popup-displayname");
const accountPopupDisplayNameChars = document.getElementById("account-popup-displayname-chars");
const accountPopupUsernameSpaces = document.getElementById(
  "account-popup-username-spaces",
);
verifySession();
accountPopupCancel.addEventListener("click", () => {
  accountPopup.classList.add("hidden");
});
accountPopupApply.addEventListener("click", () => {
  return fetch("http://localhost:3000/session/change/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionToken: sessionToken,
      userId: userId,
      username: accountPopupUsername.value,
      displayName: accountPopupDisplayName.value,
      profilePicture: "default",
    }),
  })
    .then((response) => response.json())
    .then((response) => {
      console.warn(response)
      console.log(accountPopupDisplayName.value)
      accountPopupApply.textContent = "Done!";
      verifySession();
      setTimeout(() => {
        accountPopupApply.textContent = "APPLY";
      }, 1000);
    });
});
dialogAccount.addEventListener("click", () => {
  accountPopup.classList.remove("hidden");
  configDialog.classList.add("hidden");
});
let expiryTime;
logoutPopupF.addEventListener("click", () => {
  logOutPopup.classList.add("hidden");
});
logoutPopupT.addEventListener("click", logOut);
configButton.addEventListener("click", () => {
  configDialog.classList.toggle("hidden");
});

extendButton.addEventListener("click", extendSessionTime);

logoutButton.addEventListener("click", () => {
  logOutPopup.classList.remove("hidden");
});
function logOut() {
  // Remove the session token and user ID from localStorage
  localStorage.removeItem("HASIWEBCLIENT-sessionToken");
  localStorage.removeItem("HASIWEBCLIENT-userId");
  // Destroy the session on the server side
  fetch("http://localhost:3000/session/deletecurrent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
  });
  // Redirect to the login page
  window.location.href = "../";
}
function extendSessionTime() {
  fetch("http://localhost:3000/session/extend/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
  })
    .then((response) => response.json())
    .then((response) => {
      if (response && response.expiresAt) {
        expiryTime = response.expiresAt;
        setRemainingTime();
      }

      extendButton.innerHTML = "Done!";
      setTimeout(() => {
        extendButton.innerHTML = "Extend";
      }, 1000);
    })
    .catch((error) => {
      console.error(`Session extend error:${error}`);
      extendButton.innerHTML = "Error!";
      setTimeout(() => {
        extendButton.innerHTML = "Check logs";
        setTimeout(() => {
          extendButton.innerHTML = "Extend";
        }, 1000);
      }, 1000);
    });
}
function getSessionTime() {
  return fetch("http://localhost:3000/session/sessiontime/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
  })
    .then((response) => response.json())
    .then((data) => {
      expiryTime = data.expiresAt;
      return expiryTime;
    })
    .catch(() => {
      return;
    });
}
function verifySession() {
  if (!sessionToken || !userId) {
    // If no session token or user ID exists, destroy old data and redirect to the login page
    localStorage.removeItem("HASIWEBCLIENT-sessionToken");
    localStorage.removeItem("HASIWEBCLIENT-userId");
    window.location.href = "../index.html";
  } else {
    // If a session token exists, validate it with the server
    fetch("http://localhost:3000/session/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          // If the session is valid, show the dashboard
          fetch("http://localhost:3000/session/mystats", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionToken: sessionToken,
              userId: userId,
            }),
          })
            .then((response) => response.json())
            .then((userdata) => {
              document.getElementById("welcome-message").textContent =
                `Welcome, ${userdata.displayName}!`;
              document.getElementById("account-popup-displayname").value =
                userdata.displayName;
              document.getElementById("account-popup-username").value =
                userdata.username;
              document.getElementById("username").textContent =
                userdata.displayName;
              document.getElementById("uid").textContent =
                `ID: ${userdata.userId}`;
            });
          document.getElementById("loading").classList.add("hidden");
          document.getElementById("dashboard").classList.remove("hidden");
        } else {
          // If the session is invalid, remove the token and redirect to login
          localStorage.removeItem("HASIWEBCLIENT-sessionToken");
          localStorage.removeItem("HASIWEBCLIENT-userId");
          window.location.href = "../";
        }
      })
      .catch((error) => {
        console.error("Error validating session:", error);
        localStorage.removeItem("HASIWEBCLIENT-sessionToken");
        localStorage.removeItem("HASIWEBCLIENT-userId");
        window.location.href = "../";
      });
  }
}
async function getRemainingTime() {
  try {
    if (!expiryTime) {
      const value = await getSessionTime();
      expiryTime = value;
    }

    return new Date(expiryTime).getTime() - Date.now();
  } catch (error) {
    console.error("Failed to calculate remaining session time:", error);
    return null;
  }
}

async function refreshExpiryFromServer() {
  try {
    const value = await getSessionTime();
    if (value) {
      expiryTime = value;
    }
  } catch (error) {
    console.error("Failed to refresh expiry from server:", error);
  }
}

setInterval(setRemainingTime, 1000);
setInterval(refreshExpiryFromServer, 30000);

async function setRemainingTime() {
  const time = await getRemainingTime();
  if ((await time) < 0 || !time) logOut();
  const ms = Math.max(0, new Date(expiryTime).getTime() - Date.now());
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  sessionTime.innerHTML = `Session Time: ${minutes}m ${seconds}s`;
}
accountPopupUsername.addEventListener("input", () => {
  if (/[^A-Za-z0-9]/.test(accountPopupUsername.value)) {
    accountPopupUsernameSpaces.classList.add("red");
  } else {
    accountPopupUsernameSpaces.classList.remove("red");
  }

  if (
    accountPopupUsername.value.length > 20 ||
    accountPopupUsername.value.length < 3
  ) {
    accountPopupUsernameChars.classList.add("red");
  } else {
    accountPopupUsernameChars.classList.remove("red");
  }
});
accountPopupDisplayName.addEventListener("input", () => {
  if (
    accountPopupDisplayName.value.length > 25 ||
    accountPopupDisplayName.value.length < 3
  ) {
    accountPopupDisplayNameChars.classList.add("red");
  } else {
    accountPopupDisplayNameChars.classList.remove("red");
  }
});
