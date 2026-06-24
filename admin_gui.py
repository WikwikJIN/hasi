#!/usr/bin/env python3
"""
HASI Admin GUI — Server-only mode
This GUI talks to a running HASI server over HTTP so it can run remotely.
Features added:
- Separate Add / Modify / Delete / Check tabs
- Customizable checkbox options (via Settings)
- API key and Server URL can be saved and are masked in the UI
- Logs tab will fetch server logs
"""
import os
import json
import time
import requests
import PySimpleGUI as sg

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(BASE_DIR, "gui_settings.json")

ACCENT = "#0b3d91"
BG = "#0f1724"
INPUT_BG = "#16283b"
TEXT = "#E6EEF8"

DEFAULT_BASE = "http://localhost:3000"
DEFAULT_CHECKBOXES = ["Flying", "Spinning ring parts", "Speedhacks", "Flinging"]
DEFAULT_SETTINGS = {
    "window_size": "1024x768",
    "include_ip_in_logs": True,
    "auto_copy_uid": True,
    "auto_copy_short_log": False,
    "checkbox_options": DEFAULT_CHECKBOXES,
    "stored_api_key": "",
    "save_api_key": True,
    "server_url": DEFAULT_BASE,
    "hide_server": True,
}


def load_settings():
    s = DEFAULT_SETTINGS.copy()
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                user_s = json.load(f)
                s.update(user_s)
    except Exception:
        pass
    return s


def save_settings(s):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=2)
    except Exception:
        pass


settings = load_settings()
cached_public_ip = None


def get_public_ip(timeout=3):
    global cached_public_ip
    if not settings.get("include_ip_in_logs", True):
        return "::1"
    if cached_public_ip:
        return cached_public_ip
    try:
        r = requests.get("https://api.ipify.org?format=json", timeout=timeout)
        r.raise_for_status()
        ip = r.json().get("ip")
        cached_public_ip = ip
        return ip
    except Exception:
        return "::1"


def strip_base(url: str) -> str:
    if not url:
        return DEFAULT_BASE
    return url.rstrip("/")


def http_request(method: str, base: str, path: str, payload=None, timeout=10):
    url = strip_base(base) + path
    try:
        if method == "GET":
            r = requests.get(url, timeout=timeout)
        elif method == "POST":
            r = requests.post(url, json=payload or {}, timeout=timeout)
        elif method == "DELETE":
            r = requests.delete(url, json=payload or {}, timeout=timeout)
        elif method == "PATCH":
            r = requests.patch(url, json=payload or {}, timeout=timeout)
        else:
            return None, None, f"Unsupported method: {method}"
    except Exception as e:
        return None, None, str(e)

    try:
        data = r.json()
    except Exception:
        data = r.text
    return r.status_code, data, None


def lookup_uid_public(username: str, timeout=10):
    try:
        r = requests.post(
            "https://users.roblox.com/v1/usernames/users",
            json={"usernames": [username], "excludeBannedUsers": False},
            timeout=timeout,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("data") and len(data["data"]) > 0:
            return data["data"][0].get("id"), None
        return None, "User not found"
    except Exception as e:
        return None, str(e)


def lookup_username_from_uid(uid: str, timeout=10):
    try:
        r = requests.get(f"https://users.roblox.com/v1/users/{uid}", timeout=timeout)
        if r.status_code == 200:
            data = r.json()
            return data.get("name") or data.get("displayName"), None
        return None, f"Lookup status {r.status_code}: {r.text}"
    except Exception as e:
        return None, str(e)


sg.theme_add_new("HASI_DarkBlue", {
    "BACKGROUND": BG,
    "TEXT": TEXT,
    "INPUT": INPUT_BG,
    "TEXT_INPUT": TEXT,
    "SCROLL": INPUT_BG,
    "BUTTON": (TEXT, ACCENT),
    "PROGRESS": (ACCENT, "#D0D0D0"),
    "BORDER": 1,
    "SLIDER_DEPTH": 0,
    "PROGRESS_DEPTH": 0,
})
sg.theme("HASI_DarkBlue")


def make_checkbox_rows(prefix: str, options, cols=3):
    rows = []
    for i in range(0, len(options), cols):
        row = []
        for j, opt in enumerate(options[i:i+cols]):
            idx = i + j
            row.append(sg.Checkbox(opt, key=f"{prefix}{idx}", default=False))
        rows.append(row)
    return rows


def build_window():
    opts = settings.get("checkbox_options") or DEFAULT_CHECKBOXES
    # Top inputs: server URL and API key (masked if stored)
    server_display = "********" if settings.get("hide_server") and settings.get("server_url") else settings.get("server_url", DEFAULT_BASE)
    api_display = "********" if settings.get("save_api_key") and settings.get("stored_api_key") else ""

    # Add tab
    add_rows = make_checkbox_rows("-ADD-OPT-", opts)
    add_layout = [
        [sg.Text("Username (preferred)", size=(18, 1)), sg.Input(key="-ADD-USERNAME-", size=(30, 1))],
        [sg.Text("OR UID (will be resolved)", size=(18, 1)), sg.Input(key="-ADD-UID-", size=(30, 1))],
        [sg.Text("Manual description", size=(18, 1)), sg.Input(key="-ADD-DESC-", size=(60, 1))],
    ]
    add_layout += add_rows
    add_layout += [[sg.Button("Add Flagged", key="-ADD-FLAG-")]]

    # Modify tab
    mod_rows = make_checkbox_rows("-MOD-OPT-", opts)
    modify_layout = [
        [sg.Text("Username to modify", size=(18, 1)), sg.Input(key="-MOD-USERNAME-", size=(30, 1))],
        [sg.Text("OR UID (will be resolved)", size=(18, 1)), sg.Input(key="-MOD-UID-", size=(30, 1))],
        [sg.Text("Manual new description", size=(18, 1)), sg.Input(key="-MOD-DESC-", size=(60, 1))],
    ]
    modify_layout += mod_rows
    modify_layout += [[sg.Button("Modify Flagged", key="-MOD-FLAG-")]]

    # Delete tab
    delete_layout = [
        [sg.Text("UID or Username", size=(18, 1)), sg.Input(key="-DEL-Q-", size=(30, 1))],
        [sg.Button("Delete Flagged", key="-DELETE-FLAG-")],
    ]

    # Check tab
    check_layout = [
        [sg.Text("UID or Username", size=(18, 1)), sg.Input(key="-CHK-Q-", size=(30, 1)), sg.Button("Check", key="-CHECK-FLAG-")],
        [sg.Multiline(key="-CHK-OUTPUT-", size=(90, 8), disabled=True, autoscroll=True)],
    ]

    # Logs tab
    logs_layout = [
        [sg.Multiline(key="-LOGS-", size=(100, 18), disabled=True, autoscroll=True)],
        [sg.Button("Clear Logs", key="-CLEAR-LOGS-"), sg.Button("Copy Logs", key="-COPY-LOGS-")],
    ]

    # Settings tab
    settings_layout = [
        [sg.Text("Window size"), sg.Combo(["800x600", "1024x768", "1280x800", "1366x768", "Maximized"], default_value=settings.get("window_size", "1024x768"), key="-SET-WIN-SZ-")],
        [sg.Checkbox("Include public IP in logs", key="-SET-IP-CHK-", default=settings.get("include_ip_in_logs", True)), sg.Checkbox("Auto-copy UID after add", key="-SET-AUTO-CP-", default=settings.get("auto_copy_uid", True)), sg.Checkbox("Auto-copy short log", key="-SET-AUTO-SHORT-", default=settings.get("auto_copy_short_log", False))],
        [sg.Text("Server URL (saved, can be hidden)", size=(30, 1)), sg.Input(default_text=settings.get("server_url", DEFAULT_BASE), key="-SET-SERVER-URL-", size=(40, 1))],
        [sg.Checkbox("Hide server URL in topbar", key="-SET-HIDE-SERVER-", default=settings.get("hide_server", True)), sg.Checkbox("Save API key", key="-SET-SAVE-API-", default=settings.get("save_api_key", True))],
        [sg.Text("Stored API Key (leave blank to keep existing)")],
        [sg.Input(password_char="*", key="-SET-API-KEY-", size=(40, 1), default_text=("" if not settings.get("stored_api_key") else "********"))],
        [sg.Text("Checkbox options (one per line):")],
        [sg.Multiline(default_text="\n".join(settings.get("checkbox_options", DEFAULT_CHECKBOXES)), key="-SET-OPT-MULTI-", size=(60, 6))],
        [sg.Button("Save Settings", key="-SET-SAVE-")],
    ]

    layout = [
        [sg.Text("HASI Admin — Server Manager", font=(None, 16))],
        [
            sg.Text("Server URL", size=(10, 1)),
            sg.Input(default_text=(server_display), key="-SERVER-URL-", size=(40, 1), password_char="*" if settings.get("hide_server") else None),
            sg.Text("API Key", size=(8, 1)),
            sg.Input(default_text=(api_display), key="-GLOBAL-KEY-", size=(30, 1), password_char="*"),
            sg.Button("Test Server", key="-TEST-SERVER-"),
        ],
        [
            sg.TabGroup(
                [
                    [
                        sg.Tab("Add", add_layout),
                        sg.Tab("Modify", modify_layout),
                        sg.Tab("Delete", delete_layout),
                        sg.Tab("Check", check_layout),
                        sg.Tab("Logs", logs_layout),
                        sg.Tab("Settings", settings_layout),
                    ]
                ],
                expand_x=True,
                expand_y=True,
            )
        ],
        [sg.Button("Exit")],
    ]

    win = sg.Window("HASI Admin", layout, finalize=True)
    # Apply saved window size
    try:
        ws = settings.get("window_size")
        if ws == "Maximized":
            win.maximize()
        else:
            win.TKroot.geometry(ws)
    except Exception:
        pass

    return win


def get_effective_server(values):
    v = (values.get("-SERVER-URL-") or "").strip()
    if v == "********" and settings.get("server_url"):
        return settings.get("server_url")
    return v or settings.get("server_url", DEFAULT_BASE)


def get_effective_key(values):
    v = (values.get("-GLOBAL-KEY-") or "").strip()
    if v == "********" and settings.get("save_api_key") and settings.get("stored_api_key"):
        return settings.get("stored_api_key")
    # if user typed a visible key, use it
    return v or (settings.get("stored_api_key") if settings.get("save_api_key") else "")


def refresh_logs(win, base):
    # Server does not support fetching logs; function retained as no-op
    return


def append_log_local(win, msg: str):
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        win["-LOGS-"].update(value=f"[{now}] {msg}\n", append=True)
    except Exception:
        pass


def copy_logs_to_clipboard(win):
    try:
        all_text = win["-LOGS-"].get()
        # find last non-empty line
        lines = [l for l in all_text.splitlines() if l.strip()]
        last = lines[-1] if lines else ""
        win.TKroot.clipboard_clear()
        win.TKroot.clipboard_append(last)
    except Exception:
        pass


def build_checkbox_description(values, prefix):
    opts = settings.get("checkbox_options", DEFAULT_CHECKBOXES)
    chosen = []
    for i, opt in enumerate(opts):
        if values.get(f"{prefix}{i}"):
            chosen.append(opt)
    return chosen


def main_loop():
    global settings
    while True:
        win = build_window()
        rebuild = False
        while True:
            event, values = win.read(timeout=200)
            if event == sg.TIMEOUT_EVENT:
                # periodic tasks could go here
                continue
            if event in (sg.WIN_CLOSED, "Exit"):
                win.close()
                return

            if event == "-TEST-SERVER-":
                base = get_effective_server(values)
                append_log_local(win, f"Testing server at {base} ...")
                try:
                    r = requests.get(strip_base(base), timeout=5)
                    append_log_local(win, f"Server reachable (status {r.status_code}).")
                except Exception as e:
                    append_log_local(win, f"Server unreachable: {e}")

            if event == "-ADD-FLAG-":
                base = get_effective_server(values)
                key = get_effective_key(values)
                username = (values.get("-ADD-USERNAME-") or "").strip()
                uid_field = (values.get("-ADD-UID-") or "").strip()
                manual = (values.get("-ADD-DESC-") or "").strip()
                if not manual and not any(values.get(f"-ADD-OPT-{i}") for i in range(len(settings.get("checkbox_options", [])))):
                    append_log_local(win, "Description is required (manual or checkbox).")
                    continue
                if not username and not uid_field:
                    append_log_local(win, "Provide a username or UID to add.")
                    continue
                if not username and uid_field:
                    username, err = lookup_username_from_uid(uid_field)
                    if err:
                        append_log_local(win, f"Couldn't resolve UID to username: {err}")
                        continue
                # checkbox descriptions
                chosen = build_checkbox_description(values, "-ADD-OPT-")
                final_desc = manual
                if chosen:
                    if final_desc:
                        final_desc = final_desc + ", " + ", ".join(chosen)
                    else:
                        final_desc = ", ".join(chosen)

                payload = {"username": username, "description": final_desc}
                if key:
                    payload["key"] = key
                st, data, err = http_request("POST", base, "/flag", payload)
                if err:
                    append_log_local(win, f"Error adding flagged: {err}")
                    continue
                if st and 200 <= st < 300:
                    uid = data.get("uid") if isinstance(data, dict) else None
                    client_ip = get_public_ip() if settings.get("include_ip_in_logs", True) else "::1"
                    append_log_local(win, f"✅ User {username} (ID: {uid}) flagged by {client_ip}: {final_desc}")
                    # Prepare short log
                    short = f"Added {username} (ID:{uid}) - {final_desc}"
                    # Copy short log to clipboard if configured (only latest log line)
                    if (settings.get("auto_copy_uid", True) and uid is not None) or settings.get("auto_copy_short_log", False):
                        try:
                            copy_logs_to_clipboard(win)
                            append_log_local(win, "Short log copied to clipboard.")
                        except Exception:
                            pass
                else:
                    append_log_local(win, f"Add failed (status {st}): {data}")

            if event == "-MOD-FLAG-":
                base = get_effective_server(values)
                username = (values.get("-MOD-USERNAME-") or "").strip()
                uid_field = (values.get("-MOD-UID-") or "").strip()
                manual = (values.get("-MOD-DESC-") or "").strip()
                key = get_effective_key(values)
                if not (username or uid_field) or not manual:
                    append_log_local(win, "Username or UID and new description are required to modify.")
                    continue

                # build checkbox additions
                chosen = build_checkbox_description(values, "-MOD-OPT-")
                final_desc = manual
                if chosen:
                    final_desc = final_desc + ", " + ", ".join(chosen)

                # If UID provided, query by id; otherwise query by username
                if uid_field:
                    st, data, err = http_request("GET", base, f"/id/{uid_field}")
                    if err:
                        append_log_local(win, f"Error fetching user by UID: {err}")
                        continue
                    # No flagged entry found for this UID -> try to resolve username and add
                    if st == 200 and isinstance(data, dict) and data.get("message") and "No flagged entries" in data.get("message"):
                        username_resolved, err2 = lookup_username_from_uid(uid_field)
                        if err2:
                            append_log_local(win, f"Couldn't resolve UID to username: {err2}")
                            continue
                        append_log_local(win, "No existing flagged entry; adding new one.")
                        payload = {"username": username_resolved, "description": final_desc}
                        if key:
                            payload["key"] = key
                        st2, res2, e2 = http_request("POST", base, "/flag", payload)
                        if e2:
                            append_log_local(win, f"Error adding flagged: {e2}")
                        else:
                            append_log_local(win, f"Added flagged: {res2}")
                        continue
                    if st == 200 and isinstance(data, dict) and data.get("uid"):
                        uid = data.get("uid")
                        # try to resolve username for nicer logs
                        try:
                            uname_try, _ = lookup_username_from_uid(uid)
                            if uname_try:
                                username = uname_try
                        except Exception:
                            pass
                else:
                    st, data, err = http_request("GET", base, f"/user/{username}")
                    if err:
                        append_log_local(win, f"Error fetching user: {err}")
                        continue
                    if st == 200 and isinstance(data, dict) and data.get("message") and "No flagged entries" in data.get("message"):
                        append_log_local(win, "No existing flagged entry; adding new one.")
                        payload = {"username": username, "description": final_desc}
                        if key:
                            payload["key"] = key
                        st2, res2, e2 = http_request("POST", base, "/flag", payload)
                        if e2:
                            append_log_local(win, f"Error adding flagged: {e2}")
                        else:
                            append_log_local(win, f"Added flagged: {res2}")
                        continue
                    if st == 200 and isinstance(data, dict) and data.get("uid"):
                        uid = data.get("uid")

                # If we have a uid, PATCH the entry
                if "uid" in locals():
                    if not key:
                        append_log_local(win, "Modify requires an API key with modify permissions in the API Key field.")
                        continue
                    payload = {"description": final_desc}
                    if key:
                        payload["key"] = key
                    st2, res2, e2 = http_request("PATCH", base, f"/flag/{uid}", payload)
                    if e2 or (st2 and st2 >= 400):
                        append_log_local(win, f"Error updating flagged: {e2 or res2}")
                    else:
                        append_log_local(win, f"Updated flagged entry: {res2}")
                        short = f"Updated {username or ''} (ID:{uid}) - {final_desc}"
                        # Copy short log to clipboard if configured (only latest log line)
                        if (settings.get("auto_copy_uid", True)) or settings.get("auto_copy_short_log", False):
                            try:
                                copy_logs_to_clipboard(win)
                                append_log_local(win, "Short log copied to clipboard.")
                            except Exception:
                                pass
                    continue

                append_log_local(win, f"Unexpected response from server: {data}")

            if event == "-DELETE-FLAG-":
                base = get_effective_server(values)
                key = get_effective_key(values)
                q = (values.get("-DEL-Q-") or "").strip()
                if not q:
                    append_log_local(win, "Enter a UID or username to delete.")
                    continue
                uid = None
                if q.isdigit():
                    uid = q
                else:
                    st, data, err = http_request("GET", base, f"/user/{q}")
                    if err:
                        append_log_local(win, f"Error fetching user: {err}")
                        continue
                    if st == 200 and isinstance(data, dict) and data.get("uid"):
                        uid = data.get("uid")
                    else:
                        append_log_local(win, f"User not flagged or not found: {data}")
                        continue
                if not key:
                    append_log_local(win, "Deleting requires an API key in the API Key field.")
                    continue
                st, res, err = http_request("DELETE", base, f"/flag/{uid}", {"key": key})
                if err:
                    append_log_local(win, f"Error deleting flagged: {err}")
                    continue
                if st and 200 <= st < 300:
                    client_ip = get_public_ip() if settings.get("include_ip_in_logs", True) else "::1"
                    append_log_local(win, f"✅ User {uid} unflagged by {client_ip}")
                    # Emulate short log and optionally copy it
                    short = f"Deleted {uid}"
                    # Copy short log to clipboard if configured (only latest log line)
                    if settings.get("auto_copy_uid", True) or settings.get("auto_copy_short_log", False):
                        try:
                            copy_logs_to_clipboard(win)
                            append_log_local(win, "Short log copied to clipboard.")
                        except Exception:
                            pass
                else:
                    append_log_local(win, f"Delete failed (status {st}): {res}")

            if event == "-CHECK-FLAG-":
                base = get_effective_server(values)
                q = (values.get("-CHK-Q-") or "").strip()
                if not q:
                    append_log_local(win, "Enter a UID or username to check.")
                    continue
                client_ip = get_public_ip() if settings.get("include_ip_in_logs", True) else "::1"
                if q.isdigit():
                    append_log_local(win, f"Request from {client_ip} for UID: {q}")
                    st, data, err = http_request("GET", base, f"/id/{q}")
                    if err:
                        append_log_local(win, f"Error: {err}")
                        win["-CHK-OUTPUT-"].update(value=f"Error: {err}\n", append=True)
                        continue
                    if st == 200 and isinstance(data, dict) and data.get("uid"):
                        append_log_local(win, f"✅ Sent flagged entry for user ID {q} to {client_ip}")
                        win["-CHK-OUTPUT-"].update(value=json.dumps(data) + "\n", append=True)
                    else:
                        append_log_local(win, f"✅ No flagged entries found for user ID {q} requested by {client_ip}")
                        win["-CHK-OUTPUT-"].update(value=str(data) + "\n", append=True)
                else:
                    append_log_local(win, f"Request from {client_ip} for username: {q}")
                    st, data, err = http_request("GET", base, f"/user/{q}")
                    if err:
                        append_log_local(win, f"Error: {err}")
                        win["-CHK-OUTPUT-"].update(value=f"Error: {err}\n", append=True)
                        continue
                    if st == 404 and isinstance(data, dict) and data.get("message") == "User not found.":
                        append_log_local(win, f"User not found: {q}")
                        win["-CHK-OUTPUT-"].update(value=str(data) + "\n", append=True)
                    elif st == 200 and isinstance(data, dict) and data.get("uid"):
                        append_log_local(win, f"Fetched user ID for username {q}: {data.get('uid')}")
                        append_log_local(win, f"✅ Sent flagged entry for user ID {data.get('uid')} to {client_ip}")
                        win["-CHK-OUTPUT-"].update(value=json.dumps(data) + "\n", append=True)
                    elif st == 200 and isinstance(data, dict) and data.get("message"):
                        append_log_local(win, f"{data.get('message')}")
                        win["-CHK-OUTPUT-"].update(value=str(data) + "\n", append=True)
                    else:
                        append_log_local(win, f"Unexpected response: {data}")
                        win["-CHK-OUTPUT-"].update(value=str(data) + "\n", append=True)

            # Refresh logs removed (server does not provide logs endpoint)

            if event == "-CLEAR-LOGS-":
                win["-LOGS-"].update("")

            if event == "-COPY-LOGS-":
                copy_logs_to_clipboard(win)

            if event == "-SET-SAVE-":
                # Update settings from settings tab inputs
                settings["window_size"] = values.get("-SET-WIN-SZ-") or settings.get("window_size")
                settings["include_ip_in_logs"] = bool(values.get("-SET-IP-CHK-"))
                settings["auto_copy_uid"] = bool(values.get("-SET-AUTO-CP-"))
                settings["server_url"] = values.get("-SET-SERVER-URL-") or settings.get("server_url")
                settings["hide_server"] = bool(values.get("-SET-HIDE-SERVER-"))
                settings["save_api_key"] = bool(values.get("-SET-SAVE-API-"))
                # API key from settings input
                new_api = (values.get("-SET-API-KEY-") or "").strip()
                if new_api and new_api != "********":
                    settings["stored_api_key"] = new_api
                else:
                    if not settings.get("save_api_key"):
                        settings["stored_api_key"] = ""
                # checkbox options
                opt_text = (values.get("-SET-OPT-MULTI-") or "").splitlines()
                opts = [line.strip() for line in opt_text if line.strip()]
                settings["checkbox_options"] = opts or DEFAULT_CHECKBOXES
                save_settings(settings)
                append_log_local(win, "Settings saved; rebuilding UI...")
                rebuild = True
                break

        win.close()
        if not rebuild:
            break


if __name__ == "__main__":
    main_loop()
