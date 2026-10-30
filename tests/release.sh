#!/bin/sh
# Runs before every release: the plugin manifest, the tests, and one version string everywhere.
set -e
cd "$(dirname "$0")/.."
claude plugin validate .
node tests/test.js
node tests/review.test.js
v=$(node -p "require('./package.json').version")
[ "$(node -p "require('./.claude-plugin/plugin.json').version")" = "$v" ] || { echo "plugin.json version differs from $v"; exit 1; }
grep -q "^## $v " CHANGELOG.md || { echo "CHANGELOG.md has no $v section"; exit 1; }
echo "release checks passed for $v"
