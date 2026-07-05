#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_SANDBOX="${CODEX_SANDBOX:-workspace-write}"
CODEX_APPROVAL_POLICY="${CODEX_APPROVAL_POLICY:-never}"
IMPROVE_EPHEMERAL="${IMPROVE_EPHEMERAL:-1}"
IMPROVE_ITERATIONS="${IMPROVE_ITERATIONS:-0}"
IMPROVE_JSON="${IMPROVE_JSON:-0}"
IMPROVE_LOG_DIR="${IMPROVE_LOG_DIR:-.codex-improve-logs}"
IMPROVE_MODEL="${IMPROVE_MODEL:-}"
IMPROVE_PROMPT_DIR="${IMPROVE_PROMPT_DIR:-.ops/improve-loop}"
IMPROVE_PROFILE="${IMPROVE_PROFILE:-}"
IMPROVE_SLEEP_SECONDS="${IMPROVE_SLEEP_SECONDS:-0}"
IMPROVE_STOP_ON_FAILURE="${IMPROVE_STOP_ON_FAILURE:-0}"

usage() {
  cat <<'USAGE'
Usage: ./improve.sh

Runs Codex headlessly in a loop with `codex exec`.

Prompts are read from `.ops/improve-loop` by default:
  header.md        Shared instructions prepended to every task.
  *.md             Task prompts, sorted by filename. `header.md` is skipped.

The header and task file are read immediately before each Codex run, so edits
to pending prompts are picked up while this script keeps running.

Environment knobs:
  CODEX_BIN                 Codex executable. Default: codex
  CODEX_SANDBOX             read-only | workspace-write | danger-full-access. Default: workspace-write
  CODEX_APPROVAL_POLICY     Codex approval_policy config value. Default: never
  IMPROVE_ITERATIONS        Number of full prompt cycles. 0 means forever. Default: 0
  IMPROVE_SLEEP_SECONDS     Sleep between full cycles. Default: 0
  IMPROVE_LOG_DIR           Directory for run logs. Default: .codex-improve-logs
  IMPROVE_JSON              Write Codex event streams as JSONL. Default: 0
  IMPROVE_EPHEMERAL         Avoid persisting Codex session files. Default: 1
  IMPROVE_MODEL             Optional model override.
  IMPROVE_PROMPT_DIR        Prompt directory. Default: .ops/improve-loop
  IMPROVE_PROFILE           Optional Codex profile override.
  IMPROVE_STOP_ON_FAILURE   Stop the loop after a failed Codex run. Default: 0

Examples:
  IMPROVE_ITERATIONS=1 ./improve.sh
  IMPROVE_ITERATIONS=3 IMPROVE_SLEEP_SECONDS=60 ./improve.sh
  IMPROVE_JSON=1 IMPROVE_MODEL=gpt-5.4 ./improve.sh
USAGE
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

case "$IMPROVE_ITERATIONS" in
  ''|*[!0-9]*)
    echo "IMPROVE_ITERATIONS must be a non-negative integer." >&2
    exit 2
    ;;
esac

mkdir -p "$IMPROVE_LOG_DIR"

header_file() {
  printf '%s/header.md\n' "$IMPROVE_PROMPT_DIR"
}

list_prompt_files() {
  local file

  if [[ ! -d "$IMPROVE_PROMPT_DIR" ]]; then
    echo "Prompt directory does not exist: $IMPROVE_PROMPT_DIR" >&2
    return 1
  fi

  while IFS= read -r -d '' file; do
    [[ "$(basename "$file")" == "header.md" ]] && continue
    printf '%s\n' "$file"
  done < <(find "$IMPROVE_PROMPT_DIR" -maxdepth 1 -type f -name '*.md' -print0 | sort -z)
}

first_prompt_line() {
  local file="$1"
  local line

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    printf '%s\n' "$line"
    return 0
  done < "$file"

  printf '(empty prompt)\n'
}

stop_loop() {
  echo
  echo "Stopping improve loop."
  exit 130
}
trap stop_loop INT TERM

run_codex() {
  local iteration="$1"
  local prompt_index="$2"
  local prompt_file="$3"
  local header_path
  local header_prompt
  local prompt
  local prompt_summary
  local timestamp
  local log_base
  local status
  local full_prompt
  local -a args

  header_path="$(header_file)"
  if [[ ! -f "$header_path" ]]; then
    echo "Missing required prompt header: $header_path" >&2
    exit 2
  fi

  if [[ ! -f "$prompt_file" ]]; then
    echo "Prompt file no longer exists: $prompt_file" >&2
    return 2
  fi

  header_prompt="$(< "$header_path")"
  prompt="$(< "$prompt_file")"
  prompt_summary="$(first_prompt_line "$prompt_file")"

  timestamp="$(date '+%Y%m%d-%H%M%S')"
  log_base="$IMPROVE_LOG_DIR/${timestamp}-cycle-${iteration}-task-${prompt_index}"
  full_prompt="${header_prompt}

Task:
${prompt}"

  args=(
    exec
    --sandbox "$CODEX_SANDBOX"
    -c "approval_policy=\"${CODEX_APPROVAL_POLICY}\""
    --color never
  )

  if [[ "$IMPROVE_EPHEMERAL" == "1" ]]; then
    args+=(--ephemeral)
  fi

  if [[ -n "$IMPROVE_MODEL" ]]; then
    args+=(--model "$IMPROVE_MODEL")
  fi

  if [[ -n "$IMPROVE_PROFILE" ]]; then
    args+=(--profile "$IMPROVE_PROFILE")
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] cycle ${iteration}, task ${prompt_index}: ${prompt_file}"
  echo "Task summary: ${prompt_summary}"

  if [[ "$IMPROVE_JSON" == "1" ]]; then
    "$CODEX_BIN" "${args[@]}" --json -o "${log_base}.md" "$full_prompt" \
      > "${log_base}.jsonl" \
      2> "${log_base}.stderr.log"
  else
    "$CODEX_BIN" "${args[@]}" -o "${log_base}.md" "$full_prompt" \
      > "${log_base}.stdout.log" \
      2> "${log_base}.stderr.log"
  fi

  status=$?
  if [[ "$status" -eq 0 ]]; then
    echo "Completed task ${prompt_index}; final message: ${log_base}.md"
  else
    echo "Codex failed for task ${prompt_index} with exit code ${status}." >&2
    echo "See ${log_base}.stderr.log" >&2
  fi

  return "$status"
}

iteration=1
while true; do
  if [[ "$IMPROVE_ITERATIONS" -gt 0 && "$iteration" -gt "$IMPROVE_ITERATIONS" ]]; then
    echo "Finished ${IMPROVE_ITERATIONS} improve cycle(s)."
    exit 0
  fi

  mapfile -t prompt_files < <(list_prompt_files)
  if [[ "${#prompt_files[@]}" -eq 0 ]]; then
    echo "No task prompt files found in $IMPROVE_PROMPT_DIR." >&2
    echo "Add one or more .md files next to header.md." >&2
    exit 2
  fi

  for prompt_offset in "${!prompt_files[@]}"; do
    prompt_index=$((prompt_offset + 1))
    if ! run_codex "$iteration" "$prompt_index" "${prompt_files[$prompt_offset]}"; then
      if [[ "$IMPROVE_STOP_ON_FAILURE" == "1" ]]; then
        exit 1
      fi
    fi
  done

  iteration=$((iteration + 1))

  if [[ "$IMPROVE_SLEEP_SECONDS" != "0" ]]; then
    sleep "$IMPROVE_SLEEP_SECONDS"
  fi
done
