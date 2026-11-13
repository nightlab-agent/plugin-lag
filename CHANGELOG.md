# Changelog

## Unreleased

- A `--root` that is not a folder, a `--root` with nothing after it, and an unknown option or
  stray argument now stop with exit code 2 and a line on stderr naming the argument. Before, all
  three exited 0, and a mistyped `--root` printed "No marketplace plugins installed".
- Tests: the temporary folder is removed on exit, also when a test fails.
- Tests: tags listed by name (v1.10.0 before v1.9.0) are still compared by number. No change to
  the code.

## 0.2.0 (2026-10-30)

- A last block says, for each marketplace you installed from, whether auto-update runs for it and why: a
  settings `extraKnownMarketplaces` entry, the `/plugin` toggle, the default for that marketplace, or an
  update-off variable (`DISABLE_UPDATES`, `DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  unless `FORCE_AUTOUPDATE_PLUGINS=1`). Plugins whose entry declares a `headersHelper` are named, since
  auto-update skips them. Shows when each marketplace listing was last fetched, when recorded.
- The closing hint no longer says auto-update is off for every third-party marketplace without checking.
- The closing note says the marketplace chose the commit it pins; 0.1.0 said it reviewed it, which no
  source states.
- With `CLAUDE_CONFIG_DIR` set, the plugins root is `plugins/` under it (0.1.0 looked in the home folder).

## 0.1.0 (2026-10-30)

- First release: lists installed marketplace plugins pinned to a commit and compares each pin with its
  upstream repo (one `git ls-remote` each). Tag pins are compared within their own tag family; branch pins
  follow their branch; `git-subdir` plugins whose repo moved are shown apart. `--all` and `--root`.
