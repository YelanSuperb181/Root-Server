// Runs every compiled test file. They're listed here rather than with a
// `*.test.js` pattern, because Windows doesn't expand patterns and Node only
// learned to from version 21.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = path.join(__dirname, "build-test", "test");
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => path.join(dir, name));
const run = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
