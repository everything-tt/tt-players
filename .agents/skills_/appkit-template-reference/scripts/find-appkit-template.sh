#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <keyword>"
  echo "Example: $0 checkout"
  exit 1
fi

query="$*"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ref_dir="$(cd "$script_dir/../references" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
code_dir="${APPKIT_CODE_DIR:-$repo_root/themeforest-66sQLgw3-appkit-mobile/code}"

if [ ! -d "$code_dir" ]; then
  echo "AppKit code directory not found: $code_dir"
  echo "Set APPKIT_CODE_DIR to override."
  exit 1
fi

print_matches() {
  local title="$1"
  local file="$2"

  echo
  echo "== $title =="
  awk 'NR==1{print; next} {print}' "$file" | rg -i -- "$query" || echo "(no matches)"
}

echo "Query: $query"
echo "Code directory: $code_dir"

echo
echo "== Filename matches =="
find "$code_dir" -maxdepth 1 -type f -name '*.html' | sed 's#.*/##' | sort | rg -i -- "$query" || echo "(no matches)"

print_matches "Pack page matches (pack/page/label)" "$ref_dir/page-pack-index.tsv"
print_matches "Component matches (file/name/description)" "$ref_dir/component-index.tsv"
print_matches "Homepage matches (file/label)" "$ref_dir/homepage-index.tsv"
print_matches "Project matches (file/label/description)" "$ref_dir/project-index.tsv"
