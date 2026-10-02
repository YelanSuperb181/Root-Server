// Writes root-manifest.dev.json, the copy of the manifest `npm run server`
// gives Root's dev host. The dev host (@rootsdk/dev-tools 0.21.3) sends the
// manifest's "permissions" to Root as-is, but Root's message names them
// channelView, channelCreateMessage, communityManageRoles and so on. Our names
// (view, createMessage, manageRoles) don't match, so every permission would be
// silently dropped: Blitz couldn't see a single channel in the test community,
// and commands would get no answer. This copy adds the prefixed names next to
// the originals. The real root-manifest.json stays as it is for packaging,
// where Root reads it correctly.

const fs = require("fs");
const path = require("path");
const { appIdFor } = require("./local");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "root-manifest.json"), "utf8"));

manifest.id = appIdFor(manifest);
if (!manifest.id) {
  console.error("Blitz doesn't know its App ID yet. Type  npm run configure  and paste it in.");
  process.exit(1);
}

const withPrefixedNames = (perms, prefix) => {
  const out = { ...perms };
  for (const [key, value] of Object.entries(perms ?? {})) out[prefix + key[0].toUpperCase() + key.slice(1)] = value;
  return out;
};

if (manifest.permissions) {
  manifest.permissions = {
    community: withPrefixedNames(manifest.permissions.community, "community"),
    channel: withPrefixedNames(manifest.permissions.channel, "channel"),
  };
}

// The two tools also spell single pickers differently: the packager wants
// "roleSingle"/"userSingle", the dev host "role"/"user".
const DEV_PICKER = { roleSingle: "role", userSingle: "user" };
// And the dev host crashes on number settings (it labels them as text), so
// in testing they become text boxes holding the number.
for (const group of manifest.settings?.groups ?? []) {
  for (const item of group.items ?? []) {
    const picker = item.roleOrMember;
    if (picker && DEV_PICKER[picker.selectBehavior]) picker.selectBehavior = DEV_PICKER[picker.selectBehavior];
    if (item.number) {
      item.text = item.number.defaultValue !== undefined ? { defaultValue: String(item.number.defaultValue) } : {};
      delete item.number;
    }
  }
}

fs.writeFileSync(path.join(__dirname, "root-manifest.dev.json"), JSON.stringify(manifest, null, 2) + "\n");
const asked = Object.values(manifest.permissions ?? {}).flatMap((group) => Object.keys(group).filter((k) => /^(community|channel)[A-Z]/.test(k) && group[k]));
console.log(`Asking Root for Blitz's ${asked.length} permissions in the test community (App ${manifest.id})`);
