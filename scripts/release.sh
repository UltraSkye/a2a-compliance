#!/usr/bin/env bash
# Prepare and push a release tag. The actual npm publish runs in GitHub
# Actions via .github/workflows/release.yml once the tag arrives — so
# the only thing this script needs from you is the new version string.
#
# Usage:
#   ./scripts/release.sh 0.1.0
#   ./scripts/release.sh 0.2.0-rc.1   (prerelease)
#
# What it does:
#   1. Sanity: clean working tree, main branch, green lint+typecheck+test+build
#   2. Bumps all three publishable packages + root + apps/web to <version>
#   3. Updates CHANGELOG.md: replaces the top "[Unreleased]" marker
#   4. Commits "chore(release): vX.Y.Z"
#   5. Tags vX.Y.Z (annotated)
#   6. Prints the exact push command — does NOT push on its own, so you
#      can eyeball the diff and bail if anything looks off

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: $0 <version>  (e.g. 0.1.0 or 0.2.0-rc.1)" >&2
  exit 2
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "error: '$VERSION' is not a valid semver string" >&2
  exit 2
fi

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '   \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

say "preflight"
[[ -z "$(git status --porcelain)" ]] || bad "working tree is dirty — commit or stash first"
ok "clean working tree"

BRANCH="$(git branch --show-current)"
[[ "$BRANCH" == "master" || "$BRANCH" == "main" ]] || bad "not on main/master (you are on '$BRANCH')"
ok "on $BRANCH"

TAG="v$VERSION"
if git rev-parse "$TAG" > /dev/null 2>&1; then
  bad "tag $TAG already exists"
fi
ok "tag $TAG is free"

say "install + full green suite"
pnpm install --frozen-lockfile > /dev/null
ok "deps installed"
pnpm lint > /dev/null
ok "lint"
pnpm typecheck > /dev/null
ok "typecheck"
pnpm test > /dev/null 2>&1
ok "tests"
pnpm build > /dev/null
ok "build"

say "bumping versions to $VERSION"
pnpm -r --filter=./packages/* exec npm version "$VERSION" --no-git-tag-version > /dev/null
npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
(cd apps/web && npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null)
ok "all package.json now at $VERSION"

# Regenerate lockfile so CI's --frozen-lockfile passes.
pnpm install --lockfile-only > /dev/null
ok "pnpm-lock updated"

say "CHANGELOG.md"
TODAY="$(date -u +%Y-%m-%d)"
if grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  # Turn [Unreleased] into the real version heading, in-place.
  sed -i.bak "0,/^## \\[Unreleased\\]/s//## [$VERSION] - $TODAY/" CHANGELOG.md
  rm CHANGELOG.md.bak
  ok "promoted [Unreleased] → [$VERSION] - $TODAY"
else
  echo "   (no [Unreleased] section to promote — assuming you already edited CHANGELOG.md manually)"
fi

say "one last pack preview"
# Must list every publishable package — release CI publishes all four.
for p in packages/schemas packages/core packages/cli packages/mcp; do
  name="$(node -e "console.log(require('./$p/package.json').name)")"
  size="$(cd "$p" && npm pack --dry-run 2>&1 | awk '/package size/ {print $NF}')"
  printf "   %-28s %s\n" "$name" "$size"
done

say "committing + tagging"
git add -A
git commit -q -m "chore(release): $TAG"
git tag -a "$TAG" -m "Release $TAG"
ok "$TAG tagged on $(git rev-parse --short HEAD)"

cat <<EOF

$(printf '\033[1;32mREADY.\033[0m')

Run to trigger the published release:

  git push origin $BRANCH
  git push origin $TAG

The release workflow (.github/workflows/release.yml) will then:
  1. Re-run lint + typecheck + test + build
  2. pnpm publish --provenance --access public for schemas, core, cli
  3. Create a GitHub Release with auto-generated notes

If anything looks wrong, back out with:
  git tag -d $TAG
  git reset --hard HEAD~1
EOF
