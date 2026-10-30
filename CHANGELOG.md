# Changelog

## 0.2.0 (2026-10-30)

- A last block says, for each marketplace you installed from, whether auto-update runs for it and why: a
  settings `extraKnownMarketplaces` entry, the `/plugin` toggle, the default for that marketplace, or an
  update-off variable (`DISABLE_UPDATES`, `DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  unless `FORCE_AUTOUPDATE_PLUGINS=1`). Plugins whose entry declares a `headersHelper` are named, since
  auto-update skips them. Shows when each marketplace listing was last fetched, when recorded.
- The closing hint no longer says auto-update is off for every third-party marketplace without checking.

## 0.1.0 (2026-10-30)

- First release: lists installed marketplace plugins pinned to a commit and compares each pin with its
  upstream repo (one `git ls-remote` each). Tag pins are compared within their own tag family; branch pins
  follow their branch; `git-subdir` plugins whose repo moved are shown apart. `--all` and `--root`.
