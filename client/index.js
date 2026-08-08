import fs from 'fs';
import { createRequire } from 'module';
import { question, confirm, select, multiselect } from "@topcli/prompts";
const require = createRequire(import.meta.url);
const Hasi = require('./ezhasi.cjs');
const hasi = new Hasi('https://wikdomain.com/hasidb');

fs.readFile('./settings.txt', (err, data) => {
    if ((data) === undefined) {
        fs.appendFile('settings.txt', '{"apikey": ""}', (err) => {
            if (err) throw err;
            console.log('Created config file');
        });
    }
});
const settings = {
    read: function () {
        const data = fs.readFileSync('./settings.txt', 'utf8');
        return JSON.parse(data);
    },
    apikey: async function (key) {
        const config = settings.read();
        config.apikey = key;
        fs.writeFileSync('./settings.txt', JSON.stringify(config, null, 2));
        console.log('API key saved successfully.');
    }
}
let result;
try {
    result = settings.read().apikey;
} catch (err) {
    console.error("Error reading settings.txt:", err);
    result = "";
}
if (result === "") {
    while (true) {
        const name = await question("Enter your HASI API Key:");
        if (name.trim() === "") {
            console.log("API Key cannot be empty. Please try again.");
            continue;
        } else {
            await settings.apikey(name.trim());
            break;
        }
    }
}
while (true) {
    console.clear();
    const choice = await select("Choose an option:", {
        choices: ["addUser", "checkUser", "deleteUser", "modifyUser", "changeApiKey", "exit"]
    });
    if (choice === "addUser") {
        const choice2 = await select("Choose an option:", {
            choices: ["addUserById", "addUserByUsername", "back"]
        });
        if (choice2 === "addUserById") {
            const uid = await question("Enter the UID of the user to flag, or type exit to go to menu:");
            if (uid === "exit") {
                continue;
            }
            const reason = await question("Enter the reason for flagging:");
            const response = await hasi.flag("id", uid, settings.read().apikey, reason);
            if (response.error) {
                console.error(`ERROR flagging user: ${response.error}`);
            }
            await question("Press Enter to continue...");
        } else if (choice2 === "addUserByUsername") {
            const username = await question("Enter the username of the user to flag, or type exit to go to menu:");
            if (username === "exit") {
                continue;
            }
            const reason = await question("Enter the reason for flagging:");
            const response = await hasi.flag("user", username, settings.read().apikey, reason);
            if (response.error) {
                console.error(`ERROR flagging user: ${response.error}`);
            } else {
                console.log(`User ${username} flagged successfully, Response: ${JSON.stringify(response)}`);
            }
            await question("Press Enter to continue...");
        } else if (choice2 === "back") {
            continue;
        }
    } else if (choice === "checkUser") {
        const choice2 = await select("Choose an option:", {
            choices: ["checkUserById", "checkUserByUsername", "back"]
        });
        if (choice2 === "checkUserById") {
            const uid = await question("Enter the UID of the user to check, or type exit to go to menu:");
            if (uid === "exit") {
                continue;
            }
            const response = await hasi.checkFlag(uid);
            console.log(`Response: ${JSON.stringify(response)}`);
            await question("Press Enter to continue...");
        } else if (choice2 === "checkUserByUsername") {
            const username = await question("Enter the username of the user to check, or type exit to go to menu:");
            if (username === "exit") {
                continue;
            }
            const response = await hasi.lookup(username);
            console.log(`Response: ${JSON.stringify(response)}`);
            await question("Press Enter to continue...");
        } else if (choice2 === "back") {
            continue;
        }
    } else if (choice === "deleteUser") {
        const choice2 = await select("Choose an option:", {
            choices: ["deleteByUid", "deleteByUsername", "back"]
        });
        if (choice2 === "deleteByUid") {
            const uid = await question("Enter the UID of the user to unflag, or type exit to go to menu:");
            if (uid === "exit") {
                continue;
            }
            const response = await hasi.unflag(uid, settings.read().apikey);
            console.log(`Response: ${JSON.stringify(response)}`);
            await question("Press Enter to continue...");
        } else if (choice2 === "deleteByUsername") {
            const username = await question("Enter the username of the user to unflag, or type exit to go to menu:");
            if (username === "exit") {
                continue;
            }
            const response = await hasi.unflagByUsername(username, settings.read().apikey);
            if (response.error) {
                console.error(`ERROR unflagging user: ${response.error}`);
            } else {
                console.log(`User ${username} unflagged successfully, Response: ${JSON.stringify(response)}`);
            }
            await question("Press Enter to continue...");
        } else if (choice2 === "back") {
            continue;
        }
    } else if (choice === "modifyUser") {
        const choice2 = await select("Choose an option:", {
            choices: ["modifyByUid", "back"]
        });
        if (choice2 === "modifyByUid") {
            const uid = await question("Enter the UID of the user to modify, or type exit to go to menu:");
            if (uid === "exit") {
                continue;
            }
            const description = await question("Enter the new description:");
            const response = await hasi.updateFlag(uid, description, settings.read().apikey);
            console.log(`Response: ${JSON.stringify(response)}`);
            await question("Press Enter to continue...");
        } else if (choice2 === "back") {
            continue;
        }
    } else if (choice === "changeApiKey") {
        while (true) {
            const newKey = await question("Enter your new HASI API Key:");
            if (newKey.trim() === "") {
                console.log("API Key cannot be empty. Please try again.");
                continue;
            } else {
                await settings.apikey(newKey.trim());
                break;
            }
        }
        await question("Press Enter to continue...");
    } else if (choice === "exit") {
        const exit = await confirm("Confirm exit", { initial: false });
        if (exit) {
            console.log("Bye!")
            process.exit(0);
        }
    }
}