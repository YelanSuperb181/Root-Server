// Your own settings for running and packaging Blitz on this computer: the
// DEV_TOKEN and Blitz's App ID, kept in server/.env. That file never goes to
// GitHub or into the package, and downloading a newer Blitz leaves it alone.

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "server", ".env");
const PLACEHOLDER = "your-app-id";

/** server/.env as key/value pairs (empty when there's no file yet). */
function readEnv() {
  const values = {};
  if (!fs.existsSync(ENV_FILE)) return values;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

/** Sets keys in server/.env, keeping every other line as it was. */
function writeEnv(updates) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const left = { ...updates };
  const out = lines.map((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !(m[1] in left)) return line;
    const value = left[m[1]];
    delete left[m[1]];
    return `${m[1]}=${value}`;
  });
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  for (const [key, value] of Object.entries(left)) out.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, out.join("\n") + "\n");
}

/** Whether `id` has the shape of a Root ID: 22 URL-safe base64 characters, or a UUID. */
const isRootId = (id) =>
  /^[A-Za-z0-9_-]{22}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Blitz's App ID: the one saved by `npm run configure`, or else the one in root-manifest.json. */
function appIdFor(manifest) {
  const saved = readEnv().BLITZ_APP_ID;
  if (saved && isRootId(saved)) return saved;
  if (manifest.id && manifest.id !== PLACEHOLDER) return manifest.id;
  return undefined;
}

module.exports = { ENV_FILE, readEnv, writeEnv, isRootId, appIdFor };
