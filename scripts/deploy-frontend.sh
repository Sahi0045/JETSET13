#!/usr/bin/env bash
#
# Deploy the frontend to Vercel production from the command line.
#
#   scripts/deploy-frontend.sh          # deploys origin/main
#   scripts/deploy-frontend.sh <ref>    # deploys any branch/tag/SHA
#
# Why this exists rather than a plain `vercel deploy --prod`:
#
# A CLI deploy sends the HEAD commit's author email to Vercel, which checks it
# maps to a Git account with access to the project. GitHub authors squash-merge
# commits with the account's privacy-protected address
# (<id>+<user>@users.noreply.github.com) when "Keep my email address private" is
# on, and that address is not associated with the Vercel account - so every
# `vercel deploy` is refused with "Deployment Blocked" before it builds, while
# Git-integration deploys sail through because they authenticate as the GitHub
# App instead.
#
# `git archive` exports the tree with no .git directory at all, so there is no
# commit for Vercel to attribute and the check does not apply. It also
# guarantees only COMMITTED files are uploaded: no .env, no node_modules, no
# local scratch. That second property is the reason to prefer this over
# deploying from the working directory even after the account issue is fixed.
#
# The real fix is the "Fix Git Configuration" button on any blocked deployment
# in the Vercel dashboard, which associates that noreply address with the Git
# account. Once that is done, this script is still safe but no longer necessary.

set -euo pipefail

REF="${1:-main}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cd "$REPO_ROOT"

if ! git rev-parse --verify --quiet "$REF" >/dev/null; then
  echo "Unknown ref: $REF" >&2
  exit 1
fi

SHA="$(git rev-parse --short "$REF")"
echo "==> Exporting $REF ($SHA) without git metadata"
git archive --format=tar "$REF" | tar -x -C "$STAGE"

# The project link (.vercel/project.json) is gitignored, so it is not in the
# archive and has to be carried across or the CLI will ask which project to use.
if [[ ! -d .vercel ]]; then
  echo "No .vercel directory - run 'vercel link' once in the repo first." >&2
  exit 1
fi
cp -r .vercel "$STAGE/"

# Belt and braces. git archive cannot include an untracked or ignored file, but
# uploading a .env to a build is bad enough to be worth asserting rather than
# assuming.
if find "$STAGE" -maxdepth 1 -name '.env*' ! -name '.env.example' | grep -q .; then
  echo "Refusing to deploy: an env file reached the staging directory." >&2
  exit 1
fi

echo "==> Deploying to production"
cd "$STAGE"
"$REPO_ROOT/node_modules/.bin/vercel" deploy --prod --yes

echo
echo "Deployed $REF ($SHA)."
echo "Verify with a hashed chunk rather than the dashboard status, which has"
echo "reported UNKNOWN for deployments that were building normally:"
echo
echo "  curl -s https://www.jetsetterss.com/login \\"
echo "    | grep -oE '/assets/main-[A-Za-z0-9_-]+\\.js'"
