#!/usr/bin/env bash
set -euo pipefail

project="${AIVEN_PROJECT:-ttevents}"
service="${AIVEN_SERVICE:-tt-players-db}"
database="${DATABASE_NAME:-tt_players}"
feedback_id=""
output_path=""

usage() {
  printf 'Usage: %s --feedback-id UUID --output FILE\n' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --feedback-id)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      feedback_id="$2"
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      output_path="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$feedback_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
  printf 'Invalid feedback UUID\n' >&2
  exit 2
}
[[ -n "$output_path" ]] || { usage >&2; exit 2; }

required_commands=(psql base64)
if [[ -z "${DATABASE_URL:-}" ]]; then
  required_commands+=(avn)
fi
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  }
done

if [[ -n "${DATABASE_URL:-}" ]]; then
  database_uri="$DATABASE_URL"
else
  default_uri="$(avn service connection-info pg uri "$service" --project "$project")"
  default_uri="${default_uri#\"}"
  default_uri="${default_uri%\"}"
  database_uri="${default_uri/defaultdb/${database}}"
fi

encoded="$(
  psql "$database_uri" -X -A -t -q -v ON_ERROR_STOP=1 -c "
    SELECT encode(content, 'base64')
    FROM staging.feedback_attachments
    WHERE feedback_id = '${feedback_id}'::uuid;
  "
)"
[[ -n "$encoded" ]] || {
  printf 'No attachment found for feedback %s\n' "$feedback_id" >&2
  exit 1
}

printf '%s' "$encoded" | base64 --decode > "$output_path" 2>/dev/null \
  || printf '%s' "$encoded" | base64 -D > "$output_path"
printf 'Downloaded attachment to %s\n' "$output_path"
