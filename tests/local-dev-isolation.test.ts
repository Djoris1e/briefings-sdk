import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createLocalDevFiles } from "../scripts/local-dev-files.mjs";

const identity = { commit: "a".repeat(40), sourceSha256: "b".repeat(64) };
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function repository() {
  const root = mkdtempSync(join(tmpdir(), "local-dev-test-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("concurrent local servers have independent static files and never rewrite shared secrets", () => {
  const root = repository();
  const source = join(root, ".dev.vars");
  writeFileSync(source, "EXAMPLE_KEY=test-only\n");
  const before = statSync(source).mtimeMs;
  const first = createLocalDevFiles(root, identity, "first-salt");
  const secondIdentity = { ...identity, sourceSha256: "c".repeat(64) };
  const second = createLocalDevFiles(root, secondIdentity, "second-salt");
  cleanups.push(first.cleanup, second.cleanup);
  expect(first.staticDirectory).not.toBe(second.staticDirectory);
  expect(first.staticDirectory.startsWith(root)).toBe(false);
  expect(JSON.parse(readFileSync(join(first.staticDirectory, "app-build.json"), "utf8"))).toEqual(identity);
  expect(JSON.parse(readFileSync(join(second.staticDirectory, "app-build.json"), "utf8"))).toEqual(secondIdentity);
  expect(readFileSync(source, "utf8")).toBe("EXAMPLE_KEY=test-only\n");
  expect(statSync(source).mtimeMs).toBe(before);
  expect(readFileSync(first.environmentFile, "utf8")).toContain("VIDEO_CHAT_QUOTA_SALT=first-salt");
  expect(statSync(first.environmentFile).mode & 0o777).toBe(0o600);
});

test("a configured quota salt is preserved in the isolated environment", () => {
  const root = repository();
  writeFileSync(join(root, ".dev.vars"), "VIDEO_CHAT_QUOTA_SALT=configured\n");
  const local = createLocalDevFiles(root, identity, "unused");
  cleanups.push(local.cleanup);
  expect(readFileSync(local.environmentFile, "utf8")).toBe("VIDEO_CHAT_QUOTA_SALT=configured\n");
});
