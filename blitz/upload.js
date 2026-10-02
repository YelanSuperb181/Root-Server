// `npm run upload`: puts Blitz in Root's cloud in one go. It builds Blitz,
// stages and packages a clean copy (see stage.js) under the next version
// number, and uploads it with your publishing token, which it asks for once
// and keeps in server/.env. The token is blanked out of everything printed,
// because Root's own upload command would print it.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const { readEnv, writeEnv, appIdFor, lockOwners } = require("./local");

const ROOT = __dirname;
const TOOLS = path.join(ROOT, "node_modules", "@rootsdk", "dev-tools");
const PACKAGER = path.join(TOOLS, "bin", "rootsdk-package");
const PUBLISHER = path.join(TOOLS, "publish", "bin", `RootApp.AppSdk.Publish.Console${process.platform === "win32" ? ".exe" : ""}`);
const PACKAGE = path.join(ROOT, "blitz.rootpkg");

/**
 * Runs a command, printing its output line by line with `secret` blanked out.
 * Resolves with its exit code; `seen` collects the (blanked) output.
 */
function run(command, args, { secret, env, shell, seen } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, shell: Boolean(shell), stdio: ["inherit", "pipe", "pipe"] });
    const relay = (stream, out) => {
      let pending = "";
      const clean = (text) => (secret ? text.split(secret).join("•••") : text);
      stream.on("data", (chunk) => {
        pending += chunk.toString();
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          out.write(clean(line) + "\n");
          seen?.push(clean(line));
        }
      });
      stream.on("end", () => {
        if (!pending) return;
        out.write(clean(pending));
        seen?.push(clean(pending));
      });
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
    child.on("error", (err) => {
      console.error(err.message);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const parseVersion = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? "");
  return m ? m.slice(1).map(Number) : undefined;
};
const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Root refuses a version it already has: one past the last upload, unless the manifest is ahead. */
function nextVersion(manifestVersion, lastUploaded) {
  const fromManifest = parseVersion(manifestVersion) ?? [1, 0, 0];
  const last = parseVersion(lastUploaded);
  if (!last || newer(fromManifest, last) > 0) return fromManifest.join(".");
  return `${last[0]}.${last[1]}.${last[2] + 1}`;
}

async function askToken(devToken) {
  console.log("Blitz needs its publishing token once. It's on your Blitz project's page in Root's Developer Portal,");
  console.log("and it's a different token from the DEV_TOKEN. Paste it with Ctrl+V (or a right-click), then press Enter.");
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  try {
    for (;;) {
      process.stdout.write("  Publishing token: ");
      const { value, done } = await lines.next();
      if (done) return undefined;
      const token = value.trim().replace(/^[A-Za-z_]+\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
      if (token.length < 20 || /\s/.test(token)) console.log("  That doesn't look like a token. Try copying it again.");
      else if (token === devToken) console.log("  That's your DEV_TOKEN. The publishing token is a different one on the same page.");
      else return token;
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const stop = (message) => {
    console.error(`\n${message}\n`);
    process.exit(1);
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "root-manifest.json"), "utf8"));
  if (!appIdFor(manifest)) stop("Blitz doesn't know its App ID yet. Type  npm run configure  and paste it in.");
  if (!lockOwners()) stop("Blitz doesn't know who you are yet. Type  npm run server  and wait for the line that says it noted you as the owner, stop it with Ctrl+C, then try again.");
  if (!fs.existsSync(PUBLISHER)) stop("Root's upload tool isn't installed. Type  npm install  and try again.");

  console.log("\nUploading Blitz to Root's cloud.\n");
  const env = readEnv();
  let token = env.BLITZ_UPLOAD_TOKEN;
  if (!token) {
    token = await askToken(env.DEV_TOKEN);
    if (!token) stop("Stopped before the end; nothing was uploaded.");
    writeEnv({ BLITZ_UPLOAD_TOKEN: token });
    console.log("  Saved in server/.env. It stays on this computer.\n");
  }
  const version = nextVersion(manifest.version, env.BLITZ_LAST_VERSION);

  console.log("1 of 3: building Blitz…");
  if ((await run("npm", ["run", "build"], { shell: true })) !== 0) stop("The build failed (see above), so nothing was uploaded.");

  console.log(`\n2 of 3: packaging version ${version}…`);
  if ((await run(process.execPath, [path.join(ROOT, "stage.js")], { env: { BLITZ_VERSION: version } })) !== 0) stop("Packaging failed (see above).");
  fs.rmSync(PACKAGE, { force: true });
  if ((await run(process.execPath, [PACKAGER, "--dir=deploy", `--out=${PACKAGE}`])) !== 0 || !fs.existsSync(PACKAGE)) stop("Packaging failed (see above).");

  console.log(`\n3 of 3: uploading version ${version}…`);
  const seen = [];
  const code = await run(PUBLISHER, ["push", `--file=${PACKAGE}`, `--authToken=${token}`], { secret: token, seen });
  // Remember the version either way: versions only need to go up, so a failed try costs nothing.
  writeEnv({ BLITZ_LAST_VERSION: version });
  if (code !== 0) {
    if (seen.some((line) => /invalid token|unauthenticated|unauthorized|forbidden|\b40[13]\b/i.test(line))) {
      writeEnv({ BLITZ_UPLOAD_TOKEN: "" });
      stop("Root didn't accept the publishing token. Type  npm run upload  again and paste it fresh from the Developer Portal.");
    }
    stop("The upload didn't go through (see above). Type  npm run upload  to try again; it uses the next version number.");
  }
  console.log(`\nBlitz ${version} is uploaded! Install it in your community from Root's app directory (or update it there).\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
