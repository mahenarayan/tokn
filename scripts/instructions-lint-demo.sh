#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_ROOT="${DEMO_ROOT:-${TMPDIR:-/tmp}/tokn-instructions-demo}"
TOKN_BIN=(node "$ROOT_DIR/dist/cli.js")

log() {
  printf '%s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/instructions-lint-demo.sh local
  bash scripts/instructions-lint-demo.sh public
  bash scripts/instructions-lint-demo.sh all
  bash scripts/instructions-lint-demo.sh prepare-public

Modes:
  local           Run the mature local fixture set.
  public          Clone verified public repos and run the public demo set.
  all             Run both local and public demo sets.
  prepare-public  Clone the verified public repos without running lint.

Environment:
  DEMO_ROOT       Checkout root for public repos. Defaults to /tmp/tokn-instructions-demo.
EOF
}

ensure_built() {
  if [[ -f "$ROOT_DIR/dist/cli.js" ]]; then
    return
  fi

  log "Building Tokn..."
  (
    cd "$ROOT_DIR"
    npm run build >/dev/null
  )
}

clone_repo() {
  local repo_slug="$1"
  local target_dir="$DEMO_ROOT/${repo_slug//\//__}"

  mkdir -p "$DEMO_ROOT"
  if [[ ! -d "$target_dir/.git" ]]; then
    log "Cloning $repo_slug into $target_dir"
    git clone --depth 1 --filter=blob:none "https://github.com/$repo_slug.git" "$target_dir" >/dev/null
  fi

  printf '%s\n' "$target_dir"
}

run_case() {
  local label="$1"
  shift

  echo
  echo "### $label"
  set +e
  "${TOKN_BIN[@]}" instructions-lint "$@"
  local status=$?
  set -e
  echo "exit code: $status"
}

run_local_suite() {
  run_case \
    "Local fixture: valid repo baseline" \
    "$ROOT_DIR/fixtures/instructions/valid-repo"

  run_case \
    "Local fixture: invalid repo with overlap and stale scope" \
    "$ROOT_DIR/fixtures/instructions/invalid-repo"

  run_case \
    "Local fixture: coding-agent surface with model-aware context share" \
    "$ROOT_DIR/fixtures/instructions/valid-repo" \
    --surface coding-agent \
    --model gpt-4o

  run_case \
    "Local fixture: markdown output for PR-friendly sharing" \
    "$ROOT_DIR/fixtures/instructions/invalid-repo" \
    --format markdown
}

run_public_suite() {
  local rollup_dir
  local vitest_dir
  local forem_dir
  local theia_dir
  local camunda_dir
  local powertoys_dir

  rollup_dir="$(clone_repo "rollup/rollup")"
  vitest_dir="$(clone_repo "vitest-dev/vitest")"
  forem_dir="$(clone_repo "forem/forem")"
  theia_dir="$(clone_repo "eclipse-theia/theia")"
  camunda_dir="$(clone_repo "camunda/camunda")"
  powertoys_dir="$(clone_repo "microsoft/PowerToys")"

  run_case \
    "Public repo: rollup/rollup default surface" \
    "$rollup_dir"

  run_case \
    "Public repo: vitest-dev/vitest coding-agent surface" \
    "$vitest_dir" \
    --surface coding-agent \
    --model gpt-4o

  run_case \
    "Public repo: forem/forem chat surface" \
    "$forem_dir" \
    --surface chat

  run_case \
    "Public repo: eclipse-theia/theia path-specific instructions" \
    "$theia_dir"

  run_case \
    "Public repo: camunda/camunda markdown output" \
    "$camunda_dir" \
    --format markdown

  run_case \
    "Public repo: microsoft/PowerToys code-review surface" \
    "$powertoys_dir" \
    --surface code-review
}

main() {
  local mode="${1:-local}"

  case "$mode" in
    local)
      ensure_built
      run_local_suite
      ;;
    public)
      ensure_built
      run_public_suite
      ;;
    all)
      ensure_built
      run_local_suite
      run_public_suite
      ;;
    prepare-public)
      clone_repo "rollup/rollup" >/dev/null
      clone_repo "vitest-dev/vitest" >/dev/null
      clone_repo "forem/forem" >/dev/null
      clone_repo "eclipse-theia/theia" >/dev/null
      clone_repo "camunda/camunda" >/dev/null
      clone_repo "microsoft/PowerToys" >/dev/null
      echo "Prepared public demo repos under $DEMO_ROOT"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "Unknown mode: $mode" >&2
      usage >&2
      return 1
      ;;
  esac
}

main "$@"
