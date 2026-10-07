import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertAppIdentity } from "./deployment-app-identity.mjs";

export function createLocalDevFiles(root, identity, salt) {
  assertAppIdentity(identity);
  const directory = mkdtempSync(resolve(tmpdir(), "briefing-dev-"));
  const staticDirectory = resolve(directory, "public");
  const environmentFile = resolve(directory, "worker.vars");
  try {
    mkdirSync(staticDirectory);
    writeFileSync(resolve(staticDirectory, "index.html"), "<!doctype html><title>Briefings local API</title>");
    writeFileSync(resolve(staticDirectory, "app-build.json"), JSON.stringify(identity) + "\n");
    const source = resolve(root, ".dev.vars");
    let environment = existsSync(source) ? readFileSync(source, "utf8") : "";
    if (!/^\s*(?:export\s+)?VIDEO_CHAT_QUOTA_SALT\s*=/m.test(environment)) {
      environment += `\nVIDEO_CHAT_QUOTA_SALT=${salt}\n`;
    }
    // Load secrets from a private per-process file, never visible CLI bindings.
    writeFileSync(environmentFile, environment, { mode: 0o600 });
    return { staticDirectory, environmentFile, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
