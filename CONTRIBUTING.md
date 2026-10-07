# Working on the Briefings SDK

Start with the [README](README.md), [scope](POC-PLAN.md), [agent instructions](AGENTS.md)
and the [SDK guide](docs/SDK.md). This is an embeddable prompt-to-text,
podcast and video component. Keep the SDK provider-neutral, keep the host's
publisher label and theme adaptation, and keep the existing result surface.

## Working loop

Use Node 22.12+ and the locked npm version. Run `npm ci`, configure ignored
`.dev.vars`, and use `npm run dev` for HMR on localhost:4300. See
[getting started](docs/getting-started.md).

Run `npm run check:quick` and the focused tests for the changed path. Use
`npm run test:formats` for text/podcast/API work and `npm run test:engine` for
hybrid video planning. `npm run test:embed` checks the actual component with
recorded media in Chromium. Full `npm run verify` is reserved for milestones,
not every iteration. New routes and bundling changes need a build. Docs-only
changes run `node scripts/check-docs.mjs`.

Preserve protocol ordering, cancellation, complete narration, quota admission,
provider bounds and browser/server isolation. Fixtures belong only in tests.
Live model tests need an explicitly authorized budget.

Work on a branch, open a pull request, make CI pass, and let a maintainer
merge. Nothing in this repository is deployed or published as part of routine
work; `npm run build:sdk` and `npm pack` only produce a local tarball.
