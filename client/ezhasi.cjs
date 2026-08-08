/*
  ezhasi - Easy HASI V1 API wrapper
  Usage:
    const Hasi = require('./ezhasi');
    const hasi = new Hasi('http://localhost:3000');

     Flag a user
    await hasi.flag("user", "User123456", "APIKEY", "Spamming");
    await hasi.flag("id", 51616356453, "APIKEY", "Spamming");

     Or set a default API key in the constructor
    const hasi2 = new Hasi('http://localhost:3000', 'MY_API_KEY');
    await hasi2.flag("user", "User123456", "Spamming");
*/

class Hasi {
  /**
   * @param {string} baseUrl - Base URL of the HASI server (e.g. "http://localhost:3000")
   * @param {string} [defaultKey] - Optional default API key to use when not passed per-call
   */
  constructor(baseUrl = 'http://localhost:3000', defaultKey = null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultKey = defaultKey;
  }

  /** Resolve which API key to use: method-level wins over constructor default */
  _resolveKey(apiKey) {
    return apiKey || this.defaultKey;
  }

  /** Internal fetch helper that parses JSON and throws on network errors */
  async _fetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    return res.json();
  }

  /**
   * Flag a user by username or UID.
   * @param {"user"|"id"} type - "user" to flag by username, "id" to flag by numeric UID
   * @param {string|number} value - The username (string) or UID (number)
   * @param {string} [apiKey] - API key with "write" permission (falls back to constructor key)
   * @param {string} [description] - Reason for flagging (default: "No description")
   */
  async flag(type, value, apiKey, description = 'No description') {
    const key = this._resolveKey(apiKey);
    const body = { description, key };

    if (type === 'user') {
      body.username = value;
    } else if (type === 'id') {
      body.uid = value;
    } else {
      throw new Error('type must be "user" or "id"');
    }

    const res = await fetch(`${this.baseUrl}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /**
   * Check if a user ID is flagged.
   * @param {number} uid - The Roblox user ID
   */
  async checkFlag(uid) {
    const res = await fetch(`${this.baseUrl}/id/${uid}`);
    return res.json();
  }

  /**
   * Remove a flag (sets uid to 0).
   * @param {number} uid - The Roblox user ID
   * @param {string} [apiKey] - API key with "delete" permission (falls back to constructor key)
   */
  async unflag(uid, apiKey) {
    const key = this._resolveKey(apiKey);
    const res = await fetch(`${this.baseUrl}/flag/${uid}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return res.json();
  }

  /**
   * Remove a flag by username (resolves username to UID first).
   * @param {string} username - The Roblox username
   * @param {string} [apiKey] - API key with "delete" permission (falls back to constructor key)
   */
  async unflagByUsername(username, apiKey) {
    const key = this._resolveKey(apiKey);
    const res = await fetch(`${this.baseUrl}/flag/user/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return res.json();
  }

  /**
   * Look up a user by username and see if they're flagged.
   * @param {string} username - The Roblox username
   */
  async lookup(username) {
    const res = await fetch(`${this.baseUrl}/user/${encodeURIComponent(username)}`);
    return res.json();
  }

  /**
   * Get the total count of flagged users.
   */
  async count() {
    const res = await fetch(`${this.baseUrl}/count`);
    return res.json();
  }

  /**
   * Update the description of an existing flag.
   * @param {number} uid - The Roblox user ID
   * @param {string} description - New description text
   * @param {string} [apiKey] - API key with "modify" permission (falls back to constructor key)
   */
  async updateFlag(uid, description, apiKey) {
    const key = this._resolveKey(apiKey);
    const res = await fetch(`${this.baseUrl}/flag/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, key }),
    });
    return res.json();
  }

  /**
   * Create a new API key (master permission required).
   * @param {string[]} perms - Array of permissions, e.g. ["write", "delete"]
   * @param {string} [apiKey] - Master API key (falls back to constructor key)
   */
  async createApiKey(perms, apiKey) {
    const key = this._resolveKey(apiKey);
    const res = await fetch(`${this.baseUrl}/apikey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perms, key }),
    });
    return res.json();
  }

  /**
   * Check whether an API key is a master key.
   * @param {string} [apiKey] - The API key to check (falls back to constructor key)
   */
  async isMaster(apiKey) {
    const key = this._resolveKey(apiKey);
    const res = await fetch(`${this.baseUrl}/ismaster?key=${encodeURIComponent(key)}`);
    return res.json();
  }

  /**
   * Call the teapot endpoint (fun).
   * @param {string} [drink] - Optional drink name ("tea", "coffee", etc.)
   */
  async teapot(drink) {
    const url = drink
      ? `${this.baseUrl}/teapot/${encodeURIComponent(drink)}`
      : `${this.baseUrl}/teapot`;
    const res = await fetch(url);
    return res.json();
  }
}

module.exports = Hasi;
