#!/usr/bin/env bash

run_with_service_recovery() {
  if [[ $# -lt 3 ]]; then
    echo "Usage: run_with_service_recovery <service...> -- <command...>" >&2
    return 2
  fi

  local services=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do
    services+=("$1")
    shift
  done

  if [[ $# -eq 0 || "$1" != "--" ]]; then
    echo "run_with_service_recovery requires -- before the command" >&2
    return 2
  fi
  shift

  if [[ ${#services[@]} -eq 0 || $# -eq 0 ]]; then
    echo "run_with_service_recovery requires at least one service and a command" >&2
    return 2
  fi

  local systemctl_bin="${SYSTEMCTL_BIN:-systemctl}"
  "$systemctl_bin" stop "${services[@]}" || true

  if "$@"; then
    return 0
  else
    local command_status=$?
    echo "Migration command failed with status $command_status; restarting existing services" >&2
    "$systemctl_bin" restart "${services[@]}" || true
    return "$command_status"
  fi
}
