# AGENTS.md

## Cursor Cloud specific instructions

This repository is a minimal Node.js project. Its only source file is `hi.js`, a
standalone script that prints `hi` to stdout.

- Run the app: `node hi.js`
- Node.js is preinstalled in the environment; no dependency install is required.
- There is currently no `package.json`, so there are no lint, test, or build
  commands. If a `package.json` is added later, the startup update script will
  run `npm install` automatically (it is guarded on the file existing).
