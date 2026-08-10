---
name: graft-fork
description: Use when grafting a fork's custom commits onto a new upstream release (e.g. NocoDB), or when resolving the cherry-pick conflicts that graft produces. Triggered by "graft", "graft-fork.sh", "graft fork onto release", "resolve graft conflicts", "resume the graft", or references to fork/0.264.x / release tags. Runs scripts/graft-fork.sh and repeatedly resolves conflicts until the graft completes.
---

# Graft fork commits onto a new release

Carry a fork's custom commits (column visibility, autonumber fixes, m2m joins,
tracing, cache warming, ...) onto a fresh upstream release by cutting a branch
at the release and cherry-picking the fork's commits onto it, resolving every
conflict the loop produces. Everything is driven by `scripts/graft-fork.sh`,
which pauses at conflicts exactly like an interactive rebase.

## When to use

- The user wants to graft a fork's commits onto a new release tag/commit.
- A graft is paused mid-conflict and needs resolving and resuming.
- The user references `graft-fork.sh`, `fork/0.264.x`, or a release tag and
  "conflicts".

## The script

`scripts/graft-fork.sh` (run from the repo root). It:

- Cuts a branch at `<base>` (the release) and cherry-picks every non-merge
  commit in `<graft-base>..<old-fork>` onto it.
- Pauses (exit 1) when a cherry-pick conflicts, exactly like an interactive
  rebase, and saves state in `.git/graft-fork/`.
- `--resume` continues from where it stopped, resolving/skipping the pending
  pick automatically, and runs as far as it can until the next conflict.
- Prints `graft complete: N applied, M skipped, T total` when done.

Never run `git cherry-pick --continue` yourself — `--resume` finishes the
pending pick. (If one was already run manually, the script detects it and does
not re-apply the commit.)

## Workflow

### 1. Determine if a graft is already in progress

Check for state:

```bash
ls .git/graft-fork/*.meta 2>/dev/null
```

- State exists -> it's a **resume**; skip to step 3.
- No state -> it's a **fresh run**; step 2.
- `git status` may show a pending cherry-pick even without state — treat that
  as resume too, but inspect before proceeding.

### 2. Fresh run

Determine the parameters:

- `<release>` — the new upstream release to start from (tag, e.g. `2026.08.0`,
  or commit).
- `<old-fork>` — the fork branch carrying the custom commits (e.g.
  `fork/0.264.x`).
- `<graft-base>` — a commit in the old fork **before** the fork's custom
  commits start; everything after it gets grafted. The user usually supplies
  this (it is where the fork diverged from upstream).
- `<new-branch>` — default `fork/<release>`; use `-n` to override.

Run it non-interactively:

```bash
bash scripts/graft-fork.sh <release> <old-fork> -b <graft-base> -n fork/<release> -y
```

If it prints `graft complete`, you are done. If it pauses with
`CONFLICTS — ...`, go to step 3.

### 3. Resolve conflicts, repeat until done

Loop until the script prints `graft complete`:

1. List the conflicted files:
   ```bash
   git diff --name-only --diff-filter=U
   ```
2. For each conflicted file, read it and inspect the conflict markers
   (`<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`). Understand all three sides:
   - `<<<<<<< HEAD` (ours) — the release code you are building on.
   - `||||||| parent of <sha>` (base) — what the fork commit started from.
   - `>>>>>>> <sha>` (theirs) — the fork commit's change.
3. Understand the fork commit's intent:
   ```bash
   git show <sha> --stat          # what it touched
   git show <sha>                  # the full diff
   ```
4. Resolve each file: **carry the fork's intent forward, adapted to the
   release's code**. The release moved on — merge the fork's fix/feature with
   how the release now does things rather than blindly taking either side.
   Preserve the fork's behavioral change; update its references to match the
   new release's structure/APIs. Remove all conflict markers.
5. Stage and resume:
   ```bash
   git add -A
   bash scripts/graft-fork.sh --resume -y
   ```
6. Repeat from step 1 until `graft complete`.

### 4. Report

- The number of commits applied/skipped and the final `graft complete` line.
- The branch name and head sha.
- Any commits you had to resolve by hand and how you resolved them (file +
  one-line summary each), so the user can review.
- Verify with:
  ```bash
  git log --oneline --first-parent <release>..fork/<release>
  ```

## Behavior notes

- **Empty / already-applied picks are skipped automatically** by the script —
  do not try to force them.
- If the script dies with a hard error (not a conflict pause), stop and read
  the output; do not blindly resume.
- A fresh run requires a clean working tree. If dirty, ask the user to commit
  or stash, or check they didn't mean to resume.
- State in `.git/graft-fork/` persists across sessions — the graft can be
  stopped and resumed later, even by another person.
- The default `-n fork/<release>` derives the branch name from the release; if
  that branch already exists at the release commit, the script grafts onto it
  instead of dying.

## Example (this repo)

```bash
bash scripts/graft-fork.sh <release> fork/2026.08.0 \
  -b 856cdddb8c -n fork/<release> -y
```

Mid-conflict, resolve and resume:

```bash
git add -A
bash scripts/graft-fork.sh --resume -y
```
