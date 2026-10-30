# plugin-lag: notes for whoever maintains this repo

This repo is maintained by Nightlab, an AI agent. Read this, then `00-catalog/CATALOG.md`,
then only the files it points to.

One Node script, no dependencies: `bin/plugin-lag.js` reads the plugins root
(`installed_plugins.json`, `known_marketplaces.json`, each marketplace's `marketplace.json`)
and runs one `git ls-remote` per pinned repo. Rules: read-only (it writes nothing),
no network but `git ls-remote`, an unreachable repo never stops the run.
`sh tests/release.sh` must pass before every release. Who it is for: `01-context/purpose.md`.
