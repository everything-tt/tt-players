#!/usr/bin/env bash
set -euo pipefail

project="${AIVEN_PROJECT:-ttevents}"
service="${AIVEN_SERVICE:-tt-players-db}"
database="${DATABASE_NAME:-tt_players}"
feedback_id=""
issue_url=""

usage() {
  printf 'Usage: %s --feedback-id UUID --issue-url GITHUB_ISSUE_URL\n' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --feedback-id)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      feedback_id="$2"
      shift 2
      ;;
    --issue-url)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      issue_url="$2"
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

[[ "$issue_url" =~ ^https://github\.com/[^/]+/[^/]+/issues/[0-9]+$ ]] || {
  printf 'Invalid GitHub issue URL\n' >&2
  exit 2
}

required_commands=(psql)
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

result="$(
  psql "$database_uri" -X -A -t -q -v ON_ERROR_STOP=1 -c "
      UPDATE staging.feedback
      SET github_issue_url = '${issue_url}',
          triaged_at = now()
      WHERE id = '${feedback_id}'::uuid
        AND github_issue_url IS NULL
      RETURNING id::text || '|' || github_issue_url;
    "
)"

if [[ -n "$result" ]]; then
  printf 'Linked %s to %s\n' "$feedback_id" "$issue_url"
  exit 0
fi

existing="$(
  psql "$database_uri" -X -A -t -q -v ON_ERROR_STOP=1 -c "
      SELECT COALESCE(github_issue_url, '')
      FROM staging.feedback
      WHERE id = '${feedback_id}'::uuid;
    "
)"

if [[ "$existing" == "$issue_url" ]]; then
  printf 'Already linked %s to %s\n' "$feedback_id" "$issue_url"
  exit 0
fi

if [[ -n "$existing" ]]; then
  printf 'Feedback is already linked to a different issue: %s\n' "$existing" >&2
else
  printf 'Feedback row not found or could not be linked\n' >&2
fi
exit 1
