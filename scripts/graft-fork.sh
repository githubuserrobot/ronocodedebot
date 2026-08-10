#!/usr/bin/env bash
#
# graft-fork.sh — graft a fork's custom commits onto a new release.
#
# Cut a new branch at <base> (usually the new upstream release tag or commit)
# and cherry-pick every commit from <old-fork> after <graft-base> onto it
# (i.e. `git rev-list --reverse <graft-base>..<old-fork>`, defaulting to
# <base>..<old-fork>). Use this to carry a fork's patches onto fresh NocoDB
# releases.
#
# Conflicts pause the script exactly like an interactive rebase: resolve them,
# `git add -A`, then re-run with --resume (the script finishes the pick itself).
# State lives in .git/graft-fork/<branch>.* so you can stop and come back later.
#
# Usage:
#   scripts/graft-fork.sh <base> <old-fork> [options]
#
# Options:
#   -b, --graft-base <ref>   Commit in <old-fork> before the fork's commits
#                            start; everything after it is cherry-picked.
#                            Default: <base>
#   -n, --new-branch <name>  Branch name for the graft. Default: fork-<base>
#   -d, --dry-run            Print the plan only.
#   -y, --yes                Skip the confirmation prompt.
#   -q, --quiet              Print only the summary and pause instructions.
#   -x, --debug              bash set -x trace.
#       --resume             Continue a previously interrupted run.
#       --abort              Abort the current cherry-pick and remove state.
#   -h, --help               Show this help.
#
# Examples:
#   scripts/graft-fork.sh <release> fork/2026.08.0 -b 856cdddb8c -n fork/<release>
#   scripts/graft-fork.sh --resume
#
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

BASE=""
OLD_FORK=""
GRAFT_BASE=""
NEW_BRANCH=""
NEW_BRANCH_SET=0
CUR_SHA=""
QUIET=0
DRY_RUN=0
YES=0
DEBUG=0
MODE="run"
POSARGS=()

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { (( QUIET )) || printf '%s\n' "$*"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while (( $# )); do
  case "$1" in
    -b|--graft-base)  GRAFT_BASE="${2:?--graft-base needs a value}"; shift 2 ;;
    -n|--new-branch)  NEW_BRANCH="${2:?--new-branch needs a value}"; NEW_BRANCH_SET=1; shift 2 ;;
    -d|--dry-run)     DRY_RUN=1; shift ;;
    -y|--yes)         YES=1; shift ;;
    -q|--quiet)       QUIET=1; shift ;;
    -x|--debug)       DEBUG=1; shift ;;
    --resume)         MODE="resume"; shift ;;
    --abort)          MODE="abort"; shift ;;
    -h|--help)        MODE="help"; shift ;;
    -*)               die "unknown option: $1 (try --help)" ;;
    *)                POSARGS+=("$1"); shift ;;
  esac
done

if (( DEBUG )); then set -x; fi
if [[ "$MODE" == "help" ]]; then usage; exit 0; fi

command -v git >/dev/null || die "git is required"
GITDIR="$(git rev-parse --git-dir 2>/dev/null)" || die "not a git repository"

if [[ "$MODE" != "resume" && "$MODE" != "abort" ]]; then
  BASE="${POSARGS[0]:-}"
  OLD_FORK="${POSARGS[1]:-}"
  (( ${#POSARGS[@]} <= 2 )) || die "too many arguments: ${POSARGS[@]:2} (try --help)"
  [[ -n "$BASE" ]] || die "usage: $SCRIPT_NAME <base> <old-fork> [options]"
  [[ -n "$OLD_FORK" ]] || die "usage: $SCRIPT_NAME <base> <old-fork> [options]"
fi

if [[ -z "$NEW_BRANCH" && -n "$BASE" ]]; then
  tag="${BASE##*/}"; tag="${tag#refs/tags/}"
  if [[ "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then NEW_BRANCH="fork-grafted"; else NEW_BRANCH="fork-$tag"; fi
fi

# ---------------------------------------------------------------------------
# State plumbing
# ---------------------------------------------------------------------------
STATE_DIR="$GITDIR/graft-fork"
SFX="$(printf '%s' "$NEW_BRANCH" | tr '/' '_')"
LIST_FILE="$STATE_DIR/$SFX.list"
POS_FILE="$STATE_DIR/$SFX.pos"
META_FILE="$STATE_DIR/$SFX.meta"
mkdir -p "$STATE_DIR"

has_unmerged() { git ls-files -u | grep -q .; }
in_cherry_pick() { [[ -f "$GITDIR/CHERRY_PICK_HEAD" ]]; }

find_meta() {
  [[ -f "$META_FILE" ]] && return 0
  local m metas=()
  while IFS= read -r m; do metas+=("$m"); done < <(ls "$STATE_DIR"/*.meta 2>/dev/null)
  if (( ${#metas[@]} == 1 )); then
    META_FILE="${metas[0]}"
    SFX="${META_FILE##*/}"; SFX="${SFX%.meta}"
    LIST_FILE="$STATE_DIR/$SFX.list"
    POS_FILE="$STATE_DIR/$SFX.pos"
    return 0
  fi
  (( ${#metas[@]} > 1 )) && die "multiple graft states exist; pass --new-branch"
  return 1
}

# ---------------------------------------------------------------------------
# --abort
# ---------------------------------------------------------------------------
if [[ "$MODE" == "abort" ]]; then
  find_meta || die "no graft state for '$NEW_BRANCH' (nothing to abort)"
  if in_cherry_pick; then
    git cherry-pick --abort
    echo "aborted the in-progress cherry-pick"
  fi
  local_ref="$(git rev-parse --verify -q --short HEAD 2>/dev/null || true)"
  prev="$(sed -n 's/^prev_branch=//p' "$META_FILE" | head -1)"
  if [[ -n "$prev" && "$prev" != "detached" && "$prev" != "$local_ref" \
        && "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" == "$NEW_BRANCH" ]]; then
    git switch "$prev" 2>/dev/null || true
    echo "switched back to $prev"
  fi
  rm -f "$LIST_FILE" "$POS_FILE" "$META_FILE"
  echo "removed graft state for $NEW_BRANCH"
  exit 0
fi

# ---------------------------------------------------------------------------
# --resume
# ---------------------------------------------------------------------------
if [[ "$MODE" == "resume" ]]; then
  find_meta || die "no graft state for '$NEW_BRANCH' (run without --resume first)"
  if [[ "$NEW_BRANCH_SET" != "1" ]]; then
    b="$(sed -n 's/^branch=//p' "$META_FILE" | head -1)"
    [[ -n "$b" ]] && NEW_BRANCH="$b"
  fi
  BASE="$(sed -n 's/^base=//p' "$META_FILE" | head -1)"
  GRAFT_BASE="$(sed -n 's/^graft_base=//p' "$META_FILE" | head -1)"
  CUR_SHA="$(sed -n 's/^current_sha=//p' "$META_FILE" | tail -1)"
  grep -v '^current_sha=' "$META_FILE" > "$META_FILE.tmp" 2>/dev/null && mv "$META_FILE.tmp" "$META_FILE"
  if in_cherry_pick && has_unmerged; then
    cat <<EOF
You are mid-conflict. Resolve it, then:

    git add -A
    $SCRIPT_NAME --resume
EOF
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Fresh run: validate, compute the graft, cut the branch
# ---------------------------------------------------------------------------
if [[ "$MODE" != "resume" ]]; then
  git rev-parse --verify -q "$BASE^{commit}" >/dev/null 2>&1 || die "cannot resolve base '$BASE'"
  git rev-parse --verify -q "$OLD_FORK^{commit}" >/dev/null 2>&1 || die "cannot resolve old-fork '$OLD_FORK'"
  GRAFT_BASE="${GRAFT_BASE:-$BASE}"
  git rev-parse --verify -q "$GRAFT_BASE^{commit}" >/dev/null 2>&1 || die "cannot resolve graft-base '$GRAFT_BASE'"
  if git rev-parse --verify -q "$NEW_BRANCH" >/dev/null 2>&1; then
    if [[ "$(git rev-parse "$NEW_BRANCH")" == "$(git rev-parse "$BASE^{commit}")" ]]; then
      echo "note: $NEW_BRANCH already exists at $BASE; grafting onto it"
    else
      die "branch '$NEW_BRANCH' already exists (use a different --new-branch, or --abort first)"
    fi
  fi
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "working tree is dirty; commit or stash before grafting"
  fi
  if in_cherry_pick; then
    die "a cherry-pick is already in progress (resolve and --resume, or --abort)"
  fi

  GRAFT_COMMITS=()
  while IFS= read -r c; do GRAFT_COMMITS+=("$c"); done < <(git rev-list --no-merges --reverse --topo-order "$GRAFT_BASE..$OLD_FORK")

  if [[ "$DRY_RUN" == "1" ]]; then
    cat <<EOF
Plan
  new branch : $NEW_BRANCH            (cut from $BASE)
  old fork   : $OLD_FORK
  graft base : $GRAFT_BASE

  ${#GRAFT_COMMITS[@]} commits to cherry-pick ($GRAFT_BASE..$OLD_FORK); conflicts pause for manual resolution.
EOF
    echo
    echo "commits to graft:"
    for s in ${GRAFT_COMMITS[@]+"${GRAFT_COMMITS[@]}"}; do
      printf '  %s %s\n' "$s" "$(git show -s --format=%s "$s")"
    done
    exit 0
  fi

  cat <<EOF
Plan
  new branch : $NEW_BRANCH            (cut from $BASE)
  old fork   : $OLD_FORK
  graft base : $GRAFT_BASE

  ${#GRAFT_COMMITS[@]} commits to cherry-pick ($GRAFT_BASE..$OLD_FORK); conflicts pause for manual resolution.
EOF
  if [[ "$YES" != "1" ]]; then
    if [[ ! -t 0 ]]; then
      die "not a terminal: run with -y to skip confirmation (or use --dry-run to inspect first)"
    fi
    read -r -p "Proceed? [y/N] " ans || true
    [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "aborted"; exit 1; }
  fi

  PREV_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
  if git rev-parse --verify -q "$NEW_BRANCH" >/dev/null 2>&1; then
    git switch "$NEW_BRANCH"
  else
    echo "cutting $NEW_BRANCH from $BASE"
    git switch -c "$NEW_BRANCH" "$BASE"
  fi

  printf 'branch=%s\nprev_branch=%s\nbase=%s\ngraft_base=%s\nold_fork=%s\n' \
    "$NEW_BRANCH" "$PREV_BRANCH" "$BASE" "$GRAFT_BASE" "$OLD_FORK" > "$META_FILE"
  : > "$LIST_FILE"
  printf '%s\n' ${GRAFT_COMMITS[@]+"${GRAFT_COMMITS[@]}"} >> "$LIST_FILE"
  printf '0\n' > "$POS_FILE"
fi

# ---------------------------------------------------------------------------
# Cherry-pick loop
# ---------------------------------------------------------------------------
pause_conflict() {
  printf '\n[%d/%d] %s  %s\n' "$1" "$2" "$3" "$4"
  cat <<EOF

CONFLICTS — resolve them now (interactive rebase style). When done:

    git add -A
    $SCRIPT_NAME --resume

(or leave it and come back later — state is saved.)
EOF
  printf 'current_sha=%s\n' "$3" >> "$META_FILE"
  exit 1
}

SHAS=()
while IFS= read -r c; do SHAS+=("$c"); done < "$LIST_FILE"
pos="$(cat "$POS_FILE" 2>/dev/null || echo 0)"
total="${#SHAS[@]}"
applied=0
skipped=0

for ((i=pos; i<total; i++)); do
  sha="${SHAS[$i]}"
  n=$((i+1))
  subject="$(git show -s --format='%s' "$sha" 2>/dev/null || echo '?')"

  if in_cherry_pick; then
    if has_unmerged; then
      pause_conflict "$n" "$total" "$sha" "$subject"
    fi
    # resolution is already staged — finish the pick; nothing staged — drop it
    if git diff --cached --quiet && git diff --quiet; then
      git cherry-pick --skip >/dev/null 2>&1 || git cherry-pick --quit >/dev/null 2>&1 || true
      ((skipped++))
      info "[$n/$total] skipped  $sha (already applied / empty)"
    else
      git cherry-pick --continue >/dev/null 2>&1 || true
      ((applied++))
      info "[$n/$total] applied  $sha  $subject"
    fi
    printf '%s\n' "$n" > "$POS_FILE"
    continue
  fi

  if [[ -n "$CUR_SHA" && "$sha" == "$CUR_SHA" ]]; then
    # pick was completed externally (e.g. manual git cherry-pick --continue)
    ((applied++))
    info "[$n/$total] applied  $sha  $subject"
    printf '%s\n' "$n" > "$POS_FILE"
    continue
  fi

  if out="$(git cherry-pick "$sha" 2>&1)"; then
    ((applied++))
    info "[$n/$total] applied  $sha  $subject"
  else
    if [[ -f "$GITDIR/CHERRY_PICK_HEAD" ]]; then
      if has_unmerged; then
        pause_conflict "$n" "$total" "$sha" "$subject"
      elif ! git diff --quiet && ! git diff --cached --quiet; then
        git cherry-pick --continue >/dev/null 2>&1 || true
        ((applied++))
        info "[$n/$total] applied  $sha  $subject"
      else
        git cherry-pick --skip >/dev/null 2>&1 || git cherry-pick --quit >/dev/null 2>&1 || true
        ((skipped++))
        info "[$n/$total] skipped  $sha (already applied / empty)"
      fi
    else
      printf '%s\n' "$out" >&2
      die "cherry-pick of $sha failed"
    fi
  fi
  printf '%s\n' "$n" > "$POS_FILE"
done

rm -f "$LIST_FILE" "$POS_FILE" "$META_FILE"
echo "graft complete: $applied applied, $skipped skipped, $total total"
echo
echo "done: $NEW_BRANCH = $(git rev-parse --short HEAD)"
echo "review with: git log --oneline --first-parent $BASE..$NEW_BRANCH"
