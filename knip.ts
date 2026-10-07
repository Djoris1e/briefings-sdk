import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KnipConfig } from "knip";

// Playwright navigates to HTML fixtures instead of importing their modules.
const fixtures = "tests/browser/fixtures";
const fixtureEntries = readdirSync(fixtures).filter(file => file.endsWith(".html")).flatMap(file =>
  [...readFileSync(join(fixtures, file), "utf8").matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)]
    .map(([, source]) => source.startsWith("/") ? source.slice(1) : join(fixtures, source)),
);

export default {
  entry: [
    // Internal integration boundaries documented for application customization.
    "src/react.ts", "src/server.ts",
    // Published @djoris/briefings package entrypoints (scripts/build-sdk.mjs).
    "src/briefing/index.ts", "src/briefing/react.ts", "src/briefing/server.ts",
    // Type-checked integration example (npm run check:examples).
    "examples/minimal-host/App.tsx", "examples/minimal-host/server.ts",
    // Cloudflare Pages discovers route handlers by filename.
    "functions/api/**/*.mjs", "functions/owner.mjs",
    ...fixtureEntries,
    "tests/browser/fixtures.config.ts",
    // Documented fixture regeneration command.
    "tests/support/chat/speech/generate.mjs",
  ],
  playwright: { config: ["playwright.config.ts", "app.playwright.config.ts"] },
} satisfies KnipConfig;
