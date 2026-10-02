const fs = require("fs");

const pathsToDelete = [
  "./node_modules",
  "./package-lock.json",
  "./blitz.rootpkg",
  "./deploy",
  "./root-manifest.dev.json",
  "./server/owner.local.json",
  "./networking/gen",
  "./shared/dist",
  "./server/dist",
  "./server/build-test",
  "./client/dist",
];

for (const path of pathsToDelete) {
  try {
    console.log(`Clean: deleting ${path}`);
    fs.rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.error(`Clean: failed to delete ${path}:`, error);
  }
}
