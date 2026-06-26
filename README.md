# HASI
 hacker account slaying initiative
 Inpired by Ruben Sim's EASI, but for hackers instead of p0rn addicts and also uses sqlite instead of mongodb.
## Intallation / usage
There are 3 parts of the project:
|File|Usage|
|----|-----|
|admin-gui.py|A vibecoded admin panel made in Python that uses PySimpleGUI|
|check.lua|The roblox script itself, that you put in serverscriptservice, it maybe will work with the new """"privacy"""" update, But i just told AI to not use the direct id grabbing and get it from the username since i only know JS|
|Everything else|The core Node.js server, runs at port 3000 and is not made by AI.|

## HOW TO START THE SERVER
1. Install Node.js if you haven't already.
2. Navigate to the server directory.
3. Run `npm install` to install dependencies.
4. Run `npm start` to start the server.

## HOW TO USE THE API
NOTE: The database is autocreated when the server starts
### GETTING AN USERNAME/ID
You need to make a GET request to the endpoint `/user/<username>` or `/id/<id>` The username will contact Roblox's API to get the ID, and then check if the ID is in the database. If it is, it will return the data, if not, it will return a message saying the user is not in the database. The ID endpoint will just check if the ID is in the database and return the data if it is, or a message saying the user is not in the database if it isn't.
#### EXAMPLE RESPONSES
##### Not flagged response:
`GET /user/Roblox/`
```
{"message":"No flagged entries found for this user."}
```
##### Flagged response:
`GET /user/Artemo8844/`
```
{"id":51,"uid":7299226743,"description":"Flinging"}
```
Yes, it's a real user that sits in the public database, and yes, the description is real too. And yes, this idiot exploited on a main account and is still not banned.
### FLAGGED COUNT
To check how many users are flagged, you can make a GET request to the endpoint `/count` and it will return the number of flagged users in the database.

`GET /count/`
```
{"count":70}
```
### ADDING A FLAGGED USER
To add a flagged user, you need to make a POST request to the endpoint `/flag` with the `write` permission. You need to provide the username, description, and API key in the request body.

`POST /flag`
```json
{
  "username": "Artemo8844",
  "description": "Flinging",
  "key": "your_api_key_here"
}
```

Response (success):
```json
{
  "message": "User flagged successfully.",
  "uid": 7299226743
}
```

### MODIFYING A FLAGGED USER'S DESCRIPTION
To modify a flagged user's description, you need to make a PATCH request to the endpoint `/flag/<uid>` with the `modify` permission. You need to provide the new description and API key in the request body.

`PATCH /flag/7299226743`
```json
{
  "description": "Flinging, ban evasion",
  "key": "your_api_key_here"
}
```

Response (success):
```json
{
  "message": "Flagged entry updated successfully."
}
```

### DELETING A FLAGGED USER
To delete a flagged user, you need to make a DELETE request to the endpoint `/flag/<uid>` with the `delete` permission. You need to provide the API key in the request body.

`DELETE /flag/7299226743`
```json
{
  "key": "your_api_key_here"
}
```

Response (success):
```json
{
  "message": "User marked removed (uid set to 0)."
}
```

## DATABASE STRUCTURE
There are 2 tables, the flagged, and API keys.
## FLAGGED TABLE
This is how a table looks like in the database:
|id|uid|description|
|--|---|-----------|
|1|1234567890|Exploiting|
|2|9876543210|Scamming|
|3|0|-|
The columns are as follows:
- id: The ban id, this is the primary key and is auto-incremented.
- uid: The Roblox user id, this is the unique identifier for the user.
- description: The reason for the ban, this is a text field that can be empty, but should provide context for the ban. (NOTE: Please don't use the description field for personal info, and to for example ban only for the description "Flying", because text can sometimes be misleading, misspelled, or altered to provide more context)
## API KEYS TABLE
This is how a table looks like in the database:
|perms|key|
|-----|---|
|["write","modify"]|1234567890abcdef|
|["write","modify","delete"]|habibidonpollo21435eytu|
I apologize for storing keys in plaintext, because i want to easily add keys with raw SQL commands, and i don't want to make a key management system.
I would make a "master" key to add and delete API keys, so keys can be added and deleted without having to access the database directly, and also this would allow for safer key storage, using ex. bcrypt. Coming soon.
The columns are as follows:
- perms: The permissions for the key, this is a JSON array of strings that can be "read", "write", "modify", or "delete". The permissions are as follows:
  - write: Allows the user to write data to the database.
  - modify: Allows the user to modify descriptions in the database.
  - delete: Allows the user to delete data from the database.
## CONTRIBUTING
If you want to contribute to the project, You can make an issue or a pull request. Please make sure to follow the code style and conventions used in the project. If you want to add a new feature, please make sure to discuss it with me first.

I want for people to help me with:
- Optimization
- Security
- Code style and conventions

## MAKING THE SERVER PUBLIC
If you want to have the basics:
- A domain
- A server, cloud, or self-hosted.
Instead of directly port-fowarding the server, you can use a reverse proxy to foward the requests, you can use:
- Nginx
- Caddy
- Microsoft IIS URL Rewrite
Then, refer to the documentation of the reverse proxy service.
