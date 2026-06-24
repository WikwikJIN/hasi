-- Server-side: HASI remote check + kick
-- Place this Script under ServerScriptService
-- Also don't forget to enable HTTP requests in the game settings for this to work.
--  + Don't get mad at me if a free model gives your game a backdoor since it's your fault.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- CONFIG
local BASE_URL = "https://wikdomain.com/hasidb" -- do your link or use the public one that will prob be denial-of-service attacked someday lol
local ENDPOINT_PREFIX = "/user/" -- full request: BASE_URL .. ENDPOINT_PREFIX .. urlencoded username
local MAX_RETRIES = 3
local RETRY_DELAY = 1 -- seconds between retries
local REQUEST_TIMEOUT = 8 -- seconds (not all Roblox runtimes use this)

-- Simple cache to avoid repeat lookups during runtime (optional)
local checkedCache = {} -- [userId] = true/false

local function buildUrlForUsername(username)
    return BASE_URL .. ENDPOINT_PREFIX .. HttpService:UrlEncode(tostring(username))
end

local function fetchFlaggedForUsername(username)
    local url = buildUrlForUsername(username)
    local attempt = 0
    while attempt < MAX_RETRIES do
        attempt = attempt + 1
        local ok, res = pcall(function()
            -- GetAsync can error on network issues; wrap with pcall
            -- Avoid caching by appending timestamp param
            local sep = url:find("%?") and "&" or "?"
            local finalUrl = url .. sep .. "_=" .. tostring(tick())
            return HttpService:GetAsync(finalUrl, true)
        end)
        if not ok then
            if attempt < MAX_RETRIES then
                task.wait(RETRY_DELAY)
                continue
            end
            return nil, ("network error: %s"):format(tostring(res))
        end

        -- res is a JSON string or plain text; try decode
        local success, data = pcall(function() return HttpService:JSONDecode(res) end)
        if not success then
            -- not JSON or decode failed
            return nil, ("invalid response: %s"):format(tostring(res))
        end

        -- If server returns a row object with uid and description
        -- or returns { message = "No flagged entries..." }
        return data, nil
    end
    return nil, "max retries reached"
end

local function handlePlayer(player)
    -- run async so PlayerAdded doesn't block
    task.spawn(function()
        local username = player.Name
        if not username or username == "" then
            return
        end

        -- cached positive result: already kicked/checked (cache by username now)
        if checkedCache[username] ~= nil then
            if checkedCache[username] == true then
                pcall(function() player:Kick("You are not allowed to join this experience.") end)
            end
            return
        end

        local data, err = fetchFlaggedForUsername(username)
        if err then
            -- network/parse error — do not kick for transient errors. Optionally log.
            warn(("HASI check failed for %d: %s"):format(uid, tostring(err)))
            checkedCache[uid] = false
            return
        end

        -- Decide if the player is flagged:
        -- Server's `/user/:username` returns the row when found (with 'uid' and 'description'),
        -- and may return { message = "No flagged entries found..." } when not.
        -- Also the server marks deletions by setting uid = 0, so treat uid==0 as NOT flagged.
        local isFlagged = false
        local reason = "You are not allowed to join this experience."

        if type(data) == "table" then
            -- If server returned the row directly (by username)
            if data.uid and tonumber(data.uid) and tonumber(data.uid) ~= 0 then
                isFlagged = true
                if data.description and type(data.description) == "string" and data.description ~= "-" then
                    reason = data.description
                end
            else
                isFlagged = false
            end
        end

        checkedCache[username] = isFlagged

        if isFlagged then
            local ok, e = pcall(function() player:Kick(reason) end)
            if not ok then
                warn("Failed to kick player:", e)
            end
        end
    end)
end

-- Connect PlayerAdded (server-side)
Players.PlayerAdded:Connect(handlePlayer)

-- Optionally check currently connected players (script placed while server already running)
for _, p in pairs(Players:GetPlayers()) do
    handlePlayer(p)
end