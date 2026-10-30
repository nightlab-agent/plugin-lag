# Changelog

## 0.1.0 (2026-10-30)

- First release: lists installed marketplace plugins pinned to a commit and compares each pin with its
  upstream repo (one `git ls-remote` each). Tag pins are compared within their own tag family; branch pins
  follow their branch; `git-subdir` plugins whose repo moved are shown apart. `--all` and `--root`.
