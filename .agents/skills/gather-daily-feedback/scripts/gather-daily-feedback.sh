#!/usr/bin/env bash
set -euo pipefail

timezone="${REPORT_TIMEZONE:-Europe/London}"
project="${AIVEN_PROJECT:-ttevents}"
service="${AIVEN_SERVICE:-tt-players-db}"
database="${DATABASE_NAME:-tt_players}"
report_date=""
output_format="markdown"

usage() {
  printf 'Usage: %s [--date YYYY-MM-DD] [--json]\n' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      report_date="$2"
      shift 2
      ;;
    --json)
      output_format="json"
      shift
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

required_commands=(psql node)
if [[ -z "${DATABASE_URL:-}" ]]; then
  required_commands+=(avn)
fi

for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  }
done

if [[ -n "$report_date" && ! "$report_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  printf 'Invalid date: %s (expected YYYY-MM-DD)\n' "$report_date" >&2
  exit 2
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  database_uri="$DATABASE_URL"
else
  default_uri="$(avn service connection-info pg uri "$service" --project "$project")"
  default_uri="${default_uri#\"}"
  default_uri="${default_uri%\"}"
  database_uri="${default_uri/defaultdb/${database}}"
fi

query="
SELECT COALESCE(
  json_agg(
    json_build_object(
      'id', id,
      'received_at', to_char(created_at AT TIME ZONE '${timezone}', 'YYYY-MM-DD HH24:MI:SS'),
      'message_type', message_type,
      'name', NULLIF(name, ''),
      'email', NULLIF(email, ''),
      'message', message,
      'github_issue_url', github_issue_url,
      'triaged_at', triaged_at,
      'attachment', (
        SELECT json_build_object(
          'filename', filename,
          'mime_type', mime_type,
          'size_bytes', size_bytes
        )
        FROM staging.feedback_attachments
        WHERE feedback_id = feedback.id
      )
    )
    ORDER BY created_at
  ),
  '[]'::json
)::text
FROM staging.feedback AS feedback
WHERE github_issue_url IS NULL
  $(
    if [[ -n "$report_date" ]]; then
      printf "AND created_at >= ('%s'::date AT TIME ZONE '%s')
  AND created_at < (('%s'::date + 1) AT TIME ZONE '%s')" \
        "$report_date" "$timezone" "$report_date" "$timezone"
    fi
  );
"

feedback_json="$(psql "$database_uri" -X -A -t -v ON_ERROR_STOP=1 -c "$query")"
if [[ "$output_format" == "json" ]]; then
  printf '%s\n' "$feedback_json"
  exit 0
fi

printf '%s\n' "$feedback_json" |
  REPORT_SCOPE="${report_date:-All unlinked feedback}" REPORT_TIMEZONE="$timezone" \
    node "$(dirname "$0")/format-feedback-report.js"
