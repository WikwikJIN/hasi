// Check if a session token exists in localStorage
const sessionToken = localStorage.getItem("HASIWEBCLIENT-sessionToken");
const userId = localStorage.getItem("HASIWEBCLIENT-userId");
const configButton = document.getElementById("config-button");
const configDialog = document.getElementById("dialog");
const extendButton = document.getElementById("extend-button");
function getSessionTime() {
  fetch("http://localhost:3000/session/sessiontime/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
    });
}
configButton.addEventListener("click", () => {
  configDialog.classList.toggle("hidden");
});
extendButton.addEventListener("click", () => {
  fetch("http://localhost:3000/session/extend/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
  })
    .then((response) => response.json())
    .then((response) => {
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
});
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
          body: JSON.stringify({ sessionToken: sessionToken, userId: userId }),
        })
          .then((response) => response.json())
          .then((userdata) => {
            document.getElementById("welcome-message").textContent =
              `Welcome, ${userdata.displayName}!`;
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
document.getElementById("logout-button").addEventListener("click", () => {
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
});
