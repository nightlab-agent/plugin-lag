# plugin-lag

Shows which of your installed Claude Code plugins come from a marketplace that pins
them to a commit their own repo has moved past.

The official marketplace (`claude-plugins-official`) pins most external plugins to a
commit sha and moves the pins by hand. A plugin can sit on an older commit for weeks
while its author ships fixes, and `/plugin` gives no sign
([mattpocock/skills#1164](https://github.com/mattpocock/skills/issues/1164), 31
reactions; [anthropics/claude-plugins-official#6360](https://github.com/anthropics/claude-plugins-official/issues/6360),
36 reactions, on 2026-10-30). This tool lists each one and where its upstream is now.

```
npx plugin-lag
```

```
42crunch-api-security-testing@claude-plugins-official  BEHIND
  pinned at v1.5.5 faf5305385de
  newer tag upstream: v1.16.0
adobe-for-creativity@claude-plugins-official  REPO MOVED
  pinned at main 0f487c9b1b98
  upstream main at 65e16628b120
  the repo moved; its commits may not touch plugins/creative-cloud/adobe-for-creativity
agentforce-adlc@claude-plugins-official  current
  pinned at 09bf1539d41f
  upstream default branch at 09bf1539d41f
ai-plugins@claude-plugins-official  BEHIND
  pinned at 2de00883bd2b
  upstream default branch at a8903c62a0af

2 behind, 1 in a repo that moved, 1 current (4 compared of 4).
The marketplace reviewed the commit it pins; newer upstream commits were not reviewed by it.
To follow upstream, add the author's own marketplace if the repo has one, and turn on auto-update
for it in /plugin, Marketplaces (off by default for third-party marketplaces).
```

![Claude Code runs plugin-lag.js --all on four entries copied from claude-plugins-official: 42crunch-api-security-testing BEHIND (v1.5.5, newer tag v1.16.0), adobe-for-creativity REPO MOVED, agentforce-adlc current, ai-plugins BEHIND; 2 behind, 1 in a repo that moved, 1 current](docs/preview.png)

Seen in a real Claude Code terminal (v2.1.312) on 2026-10-30, with this version loaded as a
plugin: Claude ran `plugin-lag.js --all` from its PATH on a plugins root holding four real entries
copied from `claude-plugins-official`.

## What it reports

For each plugin you installed from a marketplace, it reads the marketplace's entry and,
when the entry pins a `sha`, runs one `git ls-remote` on the plugin's repo:

| Shown | Means |
|---|---|
| `BEHIND` | The pin names a tag and the repo has a newer tag of the same kind (`v1.5.5` to `v1.16.0`), or the branch the pin follows (or the default branch) now points at a different commit than the pin. |
| `REPO MOVED` | Same as above for a plugin kept in a folder of a larger repo (`git-subdir`). The new commits may not touch that folder, so this is not counted as behind. |
| `current` | The pin is the branch tip, or the newest tag of its kind. |
| `not compared` | No `sha` in the entry, a source that is not git (npm, a folder of the marketplace), or a repo it could not reach. |

On 2026-10-30, by these rules, the 262 commit-pinned entries in `claude-plugins-official`
came out as 108 behind (1 of them by a newer tag), 75 in a repo that moved, and 79 current.

## Options

```
npx plugin-lag --all          # every commit-pinned entry in your marketplaces, installed or not
npx plugin-lag --root <dir>   # another plugins root
```

The plugins root is `CLAUDE_CODE_PLUGIN_CACHE_DIR` if set, else `~/.claude/plugins`
([plugins on disk](https://code.claude.com/docs/en/plugins/loading)). It finds your
installs in `installed_plugins.json`, or, if it cannot read that file's layout, in the
`cache/<marketplace>/<plugin>/` folders.

You can also load it as a plugin: Claude Code puts a plugin's `bin/` files on the Bash tool's
PATH while it is enabled ([standard layout](https://code.claude.com/docs/en/plugins-reference)),
so you can ask Claude to run `plugin-lag.js`, as in the picture above.

## What it does not do

- It changes nothing: no file, setting or plugin is written, installed or updated.
- It does not tell you whether a newer upstream commit is safe. The marketplace reviewed
  the commit it pins; newer commits were not reviewed by it.
- It sends nothing anywhere except one `git ls-remote` per plugin repo.

## If you want to follow upstream

Add the author's own marketplace, if their repo has one, and turn on auto-update for it
in `/plugin`, Marketplaces. Auto-update is off by default for third-party marketplaces
([Keep plugins updated](https://code.claude.com/docs/en/discover-plugins)).

## Develop

```
node tests/test.js
```

Offline: a fake plugins root and a fake `git` on PATH, 16 cases, plus 12 found in review (`node tests/review.test.js`). Changes are in
[CHANGELOG.md](CHANGELOG.md).

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).

MIT.
