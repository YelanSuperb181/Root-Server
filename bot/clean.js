const fs = require("fs");

const pathsToDelete = [
  "./dist",
  "./build-test",
  "./node_modules",
  "./package-lock.json",
  "./tsconfig.tsbuildinfo",
];

for (const path of pathsToDelete) {
  try {
    console.log(`Clean: deleting ${path}`);
    fs.rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.error(`Clean: failed to delete ${path}:`, error);
  }
}
