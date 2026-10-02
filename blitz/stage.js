// Stages a clean copy of Blitz in deploy/ for `npm run package` to upload:
// the manifest, the built server and domain client, and a node_modules with
// only what the server needs at runtime. Packaging straight from this folder
// would follow the workspace's links in node_modules into server/, client/
// and the rest: the whole toolchain, every source file and, worst of all,
// server/.env with your DEV_TOKEN and API key.

const fs = require("fs");
const path = require("path");
const { appIdFor, lockOwners } = require("./local");

const root = __dirname;
const deploy = path.join(root, "deploy");
const lockPath = path.join(root, "package-lock.json");

const fail = (message) => {
  console.error(`Stage: ${message}`);
  process.exit(1);
};

if (!fs.existsSync(lockPath)) fail("package-lock.json is missing. Run `npm install` first.");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "root-manifest.json"), "utf8"));

// The App ID comes from `npm run configure` (server/.env) unless it's in the manifest itself.
const appId = appIdFor(manifest);
if (!appId) fail("Blitz doesn't know its App ID yet. Type  npm run configure  and paste it in.");
// Blitz is private: it locks itself to communities you own (see server/src/core/privacy.ts).
const owners = lockOwners();
if (!owners) fail("Couldn't work out your Root user ID from your DEV_TOKEN, which Blitz needs to lock itself to your communities. Type  npm run configure  and paste your DEV_TOKEN again.");

fs.rmSync(deploy, { recursive: true, force: true });
fs.mkdirSync(deploy, { recursive: true });
fs.writeFileSync(path.join(deploy, "root-manifest.json"), JSON.stringify({ ...manifest, id: appId }, null, 2) + "\n");

// What the manifest deploys: the built server and the domain client.
const list = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const { client = {}, server = {} } = manifest.package ?? {};
for (const item of [...list(client.deploy), ...list(server.deploy)]) {
  const from = path.join(root, item);
  if (!fs.existsSync(from)) fail(`${item} is missing. Run \`npm run build\` first.`);
  fs.cpSync(from, path.join(deploy, item), { recursive: true, dereference: true });
}

// The lock, next to the server's main.js.
const serverDir = path.join(deploy, path.dirname(server.launch ?? "server/dist/main.js"));
fs.writeFileSync(path.join(serverDir, "lock.json"), JSON.stringify({ owners }, null, 2) + "\n");

// node_modules: every top-level package production needs (packages nested inside them come along).
const modules = path.join(deploy, "node_modules");
fs.mkdirSync(modules, { recursive: true });
let count = 0;
for (const [key, entry] of Object.entries(lock.packages)) {
  if (!/^node_modules\/(@[^/]+\/)?[^/]+$/.test(key)) continue;
  if (entry.dev || entry.devOptional || entry.link) continue;
  const from = path.join(root, key);
  if (!fs.existsSync(from)) continue; // optional, and not installed on this computer
  fs.cpSync(from, path.join(deploy, key), { recursive: true, dereference: true });
  count++;
}

// Blitz's own packages that the server imports: just their package.json and build.
const own = {
  "@blitz/shared": "shared",
  "@blitz/gen-server": "networking/gen/server",
  "@blitz/gen-shared": "networking/gen/shared",
};
for (const [name, dir] of Object.entries(own)) {
  const from = path.join(root, dir);
  if (!fs.existsSync(path.join(from, "dist"))) fail(`${dir}/dist is missing. Run \`npm run build\` first.`);
  const to = path.join(modules, name);
  fs.mkdirSync(to, { recursive: true });
  fs.copyFileSync(path.join(from, "package.json"), path.join(to, "package.json"));
  fs.cpSync(path.join(from, "dist"), path.join(to, "dist"), { recursive: true, dereference: true });
  count++;
}

// Last check: no .env files (tokens, keys) are going up.
const bad = [];
const walk = (dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (/^\.env($|\.)/.test(item.name) && item.name !== ".env.example") bad.push(path.relative(root, full));
  }
};
walk(deploy);
if (bad.length) fail(`refusing to package files that may hold tokens or keys:\n  ${bad.join("\n  ")}`);

console.log(`Stage: deploy/ is ready (${count} packages in node_modules)`);
console.log(`Stage: Blitz will only work in communities owned by ${owners.join(", ")}`);
