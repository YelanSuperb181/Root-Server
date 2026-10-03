import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRich, plainText } from "@blitz/shared";

test("Blitz's replies read into lines of parts for the menu", () => {
  const [line] = parseRich("🌿 **Zoe** · Level _3_ · `!rank`");
  assert.deepEqual(line.parts, [
    { kind: "text", text: "🌿 " },
    { kind: "bold", parts: [{ kind: "text", text: "Zoe" }] },
    { kind: "text", text: " · Level " },
    { kind: "italic", parts: [{ kind: "text", text: "3" }] },
    { kind: "text", text: " · " },
    { kind: "code", text: "!rank" },
  ]);
});

test("mentions, links and quotes", () => {
  const lines = parseRich("Hi [@Zoe](root://user/u1) in [#general](root://channel/c1)\n> be kind [docs](https://example.com/x)");
  assert.deepEqual(lines[0].parts, [
    { kind: "text", text: "Hi " },
    { kind: "user", name: "Zoe", id: "u1" },
    { kind: "text", text: " in " },
    { kind: "channel", name: "general", id: "c1" },
  ]);
  assert.equal(lines[1].quote, true);
  assert.deepEqual(lines[1].parts[1], { kind: "link", text: "docs", href: "https://example.com/x" });
});

test("underscores inside words and unclosed marks stay as text", () => {
  assert.deepEqual(parseRich("snake_case_name and **open")[0].parts, [{ kind: "text", text: "snake_case_name and **open" }]);
  assert.deepEqual(parseRich("[click](javascript:alert(1))")[0].parts, [{ kind: "text", text: "[click](javascript:alert(1))" }]);
  assert.equal(plainText("**Done:** _case #3_ for [@Zoe](root://user/u1)"), "Done: case #3 for @Zoe");
});
