## What changes

<!-- Describe the problem and the resulting behavior of the component, handler or package. -->

## Verification

<!-- Keep only the checks relevant to this change and describe what you observed. -->

- [ ] `npm run check:quick` (lint and TypeScript)
- [ ] Focused tests for the changed path (`npm run test:formats`, `npm run test:engine`, or the specific files)
- [ ] `npm run build:sdk` for changes to exported modules, CSS or packaging
- [ ] `node scripts/check-docs.mjs` for documentation changes
- [ ] Checked changed behavior on localhost:4300
- [ ] User-visible changes recorded under `## Unreleased` in `CHANGELOG.md`
