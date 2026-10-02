// `npm run configure`: asks for Blitz's App ID and your DEV_TOKEN and saves
// them in server/.env, so nothing has to be edited by hand. Run it again any
// time to change them; pressing Enter keeps what's saved.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { ENV_FILE, readEnv, writeEnv, isRootId, appIdFor } = require("./local");

/** What was pasted, without a "KEY=" in front, quotes or spaces. */
const clean = (text, key) =>
  text
    .trim()
    .replace(new RegExp(`^${key}\\s*=\\s*`, "i"), "")
    .replace(/^["']|["']$/g, "")
    .trim();
/** A DEV_TOKEN starts with two Root IDs (the test community and you), then the secret part. */
const looksLikeToken = (t) => t.length > 44 && /^[A-Za-z0-9_-]{44}/.test(t);
const hint = (s) => `${s.slice(0, 4)}…${s.slice(-4)}`;

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    console.log(`\nThis computer has Node.js ${process.versions.node}; Blitz needs 20 or newer.`);
    console.log("Install the LTS version from https://nodejs.org, close this window, open a new one and try again.\n");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "root-manifest.json"), "utf8"));
  const saved = readEnv();
  // Lines are queued as they come, so nothing pasted early gets lost.
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt) => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) {
      console.log("\nStopped before the end; nothing was saved.");
      process.exit(1);
    }
    return value;
  };
  console.log("\nSetting up Blitz on this computer. Paste with Ctrl+V (or a right-click), then press Enter.\n");

  let appId = appIdFor(manifest);
  console.log("1 of 2: Blitz's App ID");
  console.log("  In Root's Developer Portal, open your Blitz project and copy its App ID.");
  for (;;) {
    const answer = clean(await ask(appId ? `  App ID (press Enter to keep ${appId}): ` : "  App ID: "), "BLITZ_APP_ID");
    if (!answer && appId) break;
    if (isRootId(answer)) {
      appId = answer;
      break;
    }
    console.log("  That doesn't look like an App ID (22 letters, numbers, - or _). Try copying it again.");
  }

  let token = looksLikeToken(saved.DEV_TOKEN ?? "") ? saved.DEV_TOKEN : undefined;
  console.log("\n2 of 2: your DEV_TOKEN");
  console.log("  In the Developer Portal, copy the DEV_TOKEN for your Blitz project. Never share it with anyone.");
  for (;;) {
    const answer = clean(await ask(token ? `  DEV_TOKEN (press Enter to keep ${hint(token)}): ` : "  DEV_TOKEN: "), "DEV_TOKEN");
    if (!answer && token) break;
    if (looksLikeToken(answer)) {
      token = answer;
      break;
    }
    console.log("  That doesn't look like a DEV_TOKEN (a long run of letters and numbers). Try copying it again.");
  }
  rl.close();

  writeEnv({ DEV_TOKEN: token, BLITZ_APP_ID: appId });
  console.log(`\nSaved in ${path.relative(process.cwd(), ENV_FILE)}. It stays on this computer.`);

  console.log("\nAll set! Next, type:  npm run server\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
