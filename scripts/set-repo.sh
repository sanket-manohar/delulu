#!/usr/bin/env bash
# Usage: ./scripts/set-repo.sh <github-username-or-org> [repo-name]
# Replaces the YOUR_GITHUB_USERNAME placeholders in links, badges and share URLs.
set -euo pipefail
user="${1:?usage: set-repo.sh <github-username> [repo-name]}"
repo="${2:-delulu}"
files=$(grep -rl "YOUR_GITHUB_USERNAME" --include='*.md' --include='*.js' --include='*.html' --include='*.yml' --include='FUNDING.yml' . | grep -v node_modules || true)
for f in $files; do
  sed -i.bak -e "s#YOUR_GITHUB_USERNAME/delulu#${user}/${repo}#g" -e "s#YOUR_GITHUB_USERNAME.github.io/delulu#${user}.github.io/${repo}#g" -e "s#YOUR_GITHUB_USERNAME#${user}#g" "$f"
  rm -f "$f.bak"
done
echo "Updated: $files"
