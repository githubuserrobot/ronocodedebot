# Graft conflict notes

What actually worked when grafting the fork's commits onto newer NocoDB
releases. Read this before resolving graft conflicts — past resolutions often
recur on the next release because the fork's custom code keeps colliding with
the same upstream areas.

Each entry: commit applied, file(s) conflicted, what the conflict was, how it
was resolved, and any gotchas for next time.

## Current fork state (2026.08.0, squashed to 6 commits)

The original 29-commit graft (from `fork/0.264.x`) was re-squashed on branch
`fork/2026.08.0` into 6 logical commits so each future graft is ~6 cherry-picks
instead of 29. The squash reordered commits by file group; the resulting tree is
byte-identical to the pre-squash branch (verified against
`backup/pre-squash-fork-2026.08.0`).

Graft range: `856cdddb8c..fork/2026.08.0` (`856cdddb8c` == tag `2026.08.0`, the
release the fork is based on).

Graft recipe for a new release `<R>`:

```sh
bash scripts/graft-fork.sh <R> fork/2026.08.0 -b 856cdddb8c -n fork/<R> -y
```

The tooling commit (the graft script + this doc + the skill) is the FIRST commit
in the graft range — read these notes before resolving the first conflict.

Commit map, in graft order (oldest first; subject-only — these commits sit on
the same branch, so their hashes change on every rebase/amend and are
intentionally not listed; use `git log --oneline <release>..fork/<release>`):

| # | subject | from original 29-commit graft |
|---|---|---|
| 1 | chore: add graft-fork script and conflict notes | graft tooling (this script + these notes) |
| 2 | chore: add fork build/run tooling (start:prod, build_gui, run_nocodb) | [2/29] start:prod, [27/29] build_gui.sh rewrite, reduce-memory (start:prod heap 4096→2048), run_nocodb.sh |
| 3 | perf: redis cache warming and query speedups | [5/29] prewarm job, [18/29] skip cache check, [19/29] Rebuild GUI, [22/29] speedups (dropped parts), 1000/page, no rollup/link cache, PresignedUrl TTL, warm all pages, remove cache skip |
| 4 | feat: setup tracing using otlp and jaeger | [15/29] list traces, [16/29] more decorators, tracing setup (opentelemetry pins) |
| 5 | fix: treat AutoNumber as numeric in aggregates | [24/29] |
| 6 | fix: use formula expressions in filters | formula-filter fix (the [1/29] link-filter block itself was dropped) |
| 7 | feat: implement per-column role visibility | [26/29] + [27/29] + "Hide columns from audit too" follow-up |

Pre-squash full history (all 29 commits + original hashes) is preserved on the
backup branch `backup/pre-squash-fork-2026.08.0`.

Verified: `graft-test` grafted the 6 commits onto `2026.08.0` cleanly (6
applied, 0 skipped, tree identical) and `pnpm start:prod` boots it (HTTP 200).

## 2026.08.0 original graft (29 commits) — historical record

These entries are the ORIGINAL graft of `fork/0.264.x` onto `2026.08.0`
(base `cba243b4e0`, 29 commits). The resolutions are now baked into the squashed
commits above, but they still describe exactly what the fork code is and why —
expect the same conflict themes when the squashed commits meet the next release.

### [1/29] Filter using LinkToAnotherRecord path as it works — 1662816740
File: `packages/nocodb/src/db/conditionV2.ts`

Conflict: the fork adds a large inline LinkToAnotherRecord/Links filter block
(relation-aware subqueries per HAS_MANY/BELONGS_TO/MANY_TO_MANY) and restructures
the uidt dispatch into an if/else chain. The release rewrote all of this.

Resolution: took the release's version wholesale (`git checkout --ours`), the
whole file is now byte-identical to `2026.08.0`. Dropped the fork's block.

Why: the release rewrote link filtering into the field-handler architecture —
`LtarGeneralHandler` (handlers/ltar), `LinksGeneralHandler` (handlers/links),
`LookupGeneralHandler`, `RollupGeneralHandler`, `FormulaGeneralHandler` — all
registered in `FieldHandler.HANDLER_REGISTRY`. The release's `LtarGeneralHandler`
is the evolved version of the fork's inline block and strictly more capable:
adds soft-delete handling, `getParentChildContext`, `filter.meta?.ltarSubField`
routing, mm-join aliasing, and `rootApply` propagation. The fork's 2024-era
inline SQL is fully superseded. Do not re-add the fork's block on future grafts
unless the release's handler is missing a behavior the fork needs.

Also dropped the fork's imports (`RelationTypes`, `negatedMapping`/`getAlias`,
`LinkToAnotherRecordColumn`, `NcContext` from `~/interface/config`) — the
release still exports `NcContext` from `nocodb-sdk`, so HEAD's import stands.

### [2/29] Add start:prod and disable trace GC — dff50b45d5
Files: `package.json` (clean), `packages/nocodb/package.json`

Conflict: `packages/nocodb/package.json` — the release removed the `start:prod`
script entirely (its old `node docker/main`), while the fork replaced it with a
ts-node dev-loop start with a 4GB heap (`--max-old-space-size=4096`) plus an
expanded `lint` glob.

Resolution: kept the fork's version (ts-node `start:prod` + `{src,apps,libs,test}`
lint glob).

Why: the fork runs prod off TS source via ts-node on its deployment boxes — the
memory flags are load-bearing for the fork's setup. `src/main.ts` and
`src/run/docker.ts` still exist in the release, so the invocation is still valid.
Watch this on future grafts: if the release reintroduces its own `start:prod`
(compiled `docker/main`), decide which the deployment actually uses.

### [5/29] Create preawarming cache job — c280407382
Files: `packages/nocodb/src/interface/Jobs.ts`,
`packages/nocodb/src/modules/jobs/jobs-map.service.ts`,
`packages/nocodb/src/modules/jobs/jobs.module.ts`

Conflict: the commit adds a fork-custom `CacheWarmingJob` (prewarms attachment
caches; scheduled in `fallback/jobs.service.ts` `onModuleInit`). The release has
no cache warming at all, and rewrote the jobs module: it removed `UseWorker`
registration from `jobs-map.service.ts` (import + constructor param + jobMap
entry) and `jobs.module.ts` (provider). The fork's commit kept `UseWorker`
wiring and added `CacheWarmingJob` alongside it, so every hunk conflicted with
the release's removals.

Resolution: followed the release's structure (UseWorker dropped) and re-applied
only the commit's intent — added the `CacheWarmingJob` import, constructor param,
and `[JobTypes.CacheWarmingJob]` map entry in `jobs-map.service.ts`; the import
and provider in `jobs.module.ts`; and the `CacheWarmingJobData` interface appended
after `DataImportJobData` in `Jobs.ts` (the enum line `CacheWarmingJob =
'cache-warming-job'` had already applied cleanly).

Gotchas:
- The release still ships `use-worker.decorator.ts`, `use-worker.processor.ts`,
  and `@UseWorker() uploadViaURL` in `attachments.service.ts`, but no longer
  registers `UseWorker` in the jobs map — the fallback queue's `jobWrapper`
  silently skips unknown job names, so UseWorker jobs are now no-ops. The fork
  relies on `@UseWorker()` only once (attachments `uploadViaURL`). If the fork
  needs that behavior, re-add the `UseWorker` import/param/entry on top of the
  release's jobs-map.
- `cache-warming-job.ts` mixes `~/` and `src/` import aliases; both are valid
  (`tsconfig.json` maps `src/*`, `~/*`, `@/*` to `./src/*`).
- The commit also applies cleanly: `fallback/jobs.service.ts` schedules
  `JobTypes.CacheWarmingJob` on startup; `redis/jobs.service.ts` adds two debug
  log lines (`"wtf"`, `"started module"`); `GenericS3.ts` bumps signed-URL expiry
  to 48h; `PresignedUrl.ts` drops a blank line.

### [15/29] Add traces for list calls — 0fe33939
File: `packages/nocodb/src/db/conditionV2.ts` (dropped hunk)

The fork adds `import { trace } from '~/tracing/decorator'` plus `@trace()`
decorators across `conditionV2.ts`, `sortV2.ts`, `main.ts`, `models/Sort.ts`,
`services/datas.service.ts`. The `conditionV2.ts` hunk was DROPPED from the
grafted commit — same root cause as [1/29]: the release rewrote `conditionV2.ts`
(LTAR/link filtering moved into the `FieldHandler` architecture), so there was no
clean place for the import/decorator and the resolution let it go. The other
four files carried the decorators. Do not re-add conditionV2 tracing on future
grafts; if tracing in link filters is needed, trace at the handler layer instead.

### [16/29] Add more tracing decorators — a57537e3
File: `packages/nocodb/src/db/BaseModelSqlv2.ts` (dropped hunk)

Adds `@trace()` to a `BaseModelSqlv2` method plus lines in `cache/NocoCache.ts`
and `plugins/GenericS3/GenericS3.ts`. The `BaseModelSqlv2.ts` hunk was dropped —
the release's `BaseModelSqlv2` diverged too far (see [22/29], the fork's own
massive BaseModelSqlv2 rewrite was also dropped). NocoCache.ts and GenericS3.ts
trace lines carried.

### [18/29] Skip checking cache for URLs in cache warmer — 9283e2c5
Files: `packages/nocodb/src/models/PresignedUrl.ts`,
`packages/nocodb/src/services/datas.service.ts`,
`packages/nocodb/src/db/BaseModelSqlv2.ts`

Fork: adds `ignoreCache?: boolean` to `DatasService.list` args and threads it
through to `baseModel.list(...)` (also strips `skipSubstitutingColumnIds`/
`skipSortBasedOnOrderCol` from the call, simplifying it). `PresignedUrl.ts` and
the cache-warming job also change.

Grafted: `DatasService` → `baseModel.list` plumbing differs in the release, so
the `ignoreCache` flag ended up on `BaseModelSqlv2.list`'s options interface
instead (the `ignoreCache?: boolean` field in `list`'s opts param) — i.e. the
flag was ported DOWN one layer to where the release actually reads it. Expect to
re-locate this flag on future grafts; grep for `ignoreCache` in
`BaseModelSqlv2.ts` + `datas.service.ts` to see the final placement.

### [19/29] Rebuild GUI — cd2c1f8a
Files: `packages/nc-gui/package.json`, `packages/nocodb/package.json` (dropped)

Commit is mostly committed GUI build artifacts (copies dist) plus small
package.json edits (node engines bump, dependency reshuffle). The two
package.json hunks were dropped as superseded — the release's dependency sets
already moved past the fork's reshuffle (same theme as [27/29] and [29/29]). The
dist/build artifacts carried. No action for future grafts.

### [22/29] Speed ups for queries — 0c279799
Files: `packages/nocodb/src/db/BaseModelSqlv2.ts` (3010 lines rewritten),
`packages/nocodb/src/db/genRollupSelectv2.ts`, `services/columns.service.ts`,
`nocodb/package.json`, `pnpm-lock.yaml`, `nocodb-sdk/src/lib/aggregationHelper.ts`,
`cache-warming-job.ts`, `nc_job_008_recover_disconnected_table_name.ts`

The fork's biggest custom commit: a full rewrite of `BaseModelSqlv2` (rollups,
MM lists, CTEs) + rollup-select generation + columns service + a lockfile/package
update. The grafted commit kept ONLY the small pieces that still make sense —
`aggregationHelper.ts` (+1 line), a cache-warming-job line, and a migration-line
fix — and DROPPED the entire BaseModelSqlv2/genRollupSelectv2/columns.service
rewrite plus the package.json/pnpm-lock churn. The release's `BaseModelSqlv2`
already contains the evolved version of everything the fork's rewrite did (the
release rewrote the same area independently). Do NOT attempt to re-graft the
BaseModelSqlv2 rewrite; if a specific speed-up is missing, port it as a targeted
patch on top of the release's current code.

### [24/29] fix: treat AutoNumber as numeric in aggregates — 034420e8
Files: `packages/nocodb/src/db/aggregations/*` → moved to
`packages/nocodb/src/dbQueryClient/aggregations/handlers/*`

Fork: adds `UITypes.AutoNumber` to the "numeric" lists in
`db/aggregations/{mysql2,pg,sqlite3}.ts` so aggregates use NULL checks instead
of empty-string comparisons. The release MOVED the aggregations module from
`db/aggregations/` to `dbQueryClient/aggregations/handlers/{mysql,pg,sqlite}.handler.ts`,
so the graft re-applied the same `UITypes.AutoNumber` additions at the NEW
locations (`mysql.handler.ts`, `sqlite.handler.ts`; the pg handler already had
AutoNumber in the release). Gotcha: on future grafts the fork's aggregation edits
will always conflict on file paths — port the edits to
`dbQueryClient/aggregations/handlers/`.

### [26/29] feat: implement per-column role visibility — 7e8d60f4
Files: `packages/nocodb/src/helpers/dbHelpers.ts`,
`packages/nocodb/src/meta/migrations/XcMigrationSourcev2.ts` (plus ~25 new
files/UI/controllers for the feature — those applied cleanly)

Conflict: the fork's feature makes `shouldSkipField` async, adds a
`context?: NcContext` param, and inserts a `ColumnRoleVisibility.get(context, …)`
block that returns `true` (hide the column) when the column is disabled for the
user's role; it also converts `getQueriedColumns`' `.filter()` into an async
`for` loop. The release had evolved `shouldSkipField` since the fork branched —
it's still sync and gained a `fk_display_value_column_id?: string | null` param
with matching call sites, so the signature/body/call-site hunks all conflicted.
`XcMigrationSourcev2.ts`: the fork's list only knew migrations up to `nc_091`;
the release has up to `nc_098`, so adding the `nc_custom_001_column_role_visibility`
import + `getMigrations()` entry + switch case conflicted.

Resolution: merged the fork's intent onto the release's newer code —
`shouldSkipField` becomes async, keeps the release's `fk_display_value_column_id`
param, and gains the fork's `context` param + role-visibility block
(`git diff 2026.08.0 46ed81ba43` shows the exact final shape). In
`XcMigrationSourcev2.ts`, the custom migration was appended to the release's
list (`nc_098_default_workspace` … `nc_custom_001_column_role_visibility`) rather
than to the fork's `nc_091` position. The new migration file
`nc_custom_001_column_role_visibility.ts` itself added cleanly.

Gotchas (IMPORTANT — process traps hit this commit):
- `git commit --amend` is REFUSED while a cherry-pick is in progress
  ("You are in the middle of a cherry-pick -- cannot amend"). To rewrite a
  botched commit mid-pick: `git reset --soft HEAD^` (keeps index), `git add`
  the fixed files, then `git commit -C ORIG_HEAD`.
- A plain `git commit` while CHERRY_PICK_HEAD exists (all conflicts resolved)
  COMPLETES the pick and CLEARS CHERRY_PICK_HEAD. So after the reset/commit
  rewrite above, the *next* pick's state is gone — the script's `--resume` then
  treats that pending commit as "completed externally" and SKIPS it without
  committing its staged changes. Fix: manually commit the in-flight pick's
  staged files (`git commit -C <fork-sha>`) BEFORE resuming the script.
- Always verify no markers are baked into the COMMITTED tree, not just the
  working tree: `git grep -lE "^(<<<<<<<|=======|>>>>>>>)" HEAD -- '*.ts'`.
  This commit was originally created via `git cherry-pick --continue` with
  markers still in `dbHelpers.ts`/`XcMigrationSourcev2.ts` and had to be
  rewritten afterwards.

### [27/29] feat: implement per-column role visibility — dff8e35c
Files: `build_gui.sh`, `package.json` (root), `packages/nc-gui/package.json`,
`pnpm-lock.yaml`

Note: the subject is identical to [26/29] (the fork re-used the message) but the
commit is really the fork's GUI build-script rewrite + chatwoot dependency.

Conflict: only `packages/nc-gui/package.json` went UU. The fork adds
`"@productdevbook/chatwoot": "^2.0.0"` to dependencies; the release ALREADY ships
chatwoot there (line ~36) and wires it as a nuxt module in `nuxt.config.ts`
(`modules: [..., '@productdevbook/chatwoot']`).

Resolution:
- `nc-gui/package.json` → took ours; release already has chatwoot.
- root `package.json` → REVERTED the fork's change: it added a bogus
  `pnpm.overrides.dependencies` block (not a real pnpm option; chatwoot is
  already a normal root dependency) — `git checkout HEAD -- package.json`.
- `pnpm-lock.yaml` → REVERTED to release. The fork's insert created a DUPLICATE
  `dependencies:` key under the `packages/nc-gui:` importer with a STALE
  resolution (`magicast@0.3.5` / `vue@3.5.15`); the release lock already has
  chatwoot under that importer at the correct resolution
  (`magicast@0.5.3` / `vue@3.5.14`).
- `build_gui.sh` → KEPT the fork's rewrite (`set -euo pipefail`, `ROOT_DIR`/
  `GUI_DIR` vars, builds nocodb-sdk, runs `pnpm run install:local-sdk`,
  cleans `.nuxt`/`.output`/`dist`, runs `build:copy`). Verify the scripts it
  calls exist on the release: `install:local-sdk` (root `package.json` →
  `node scripts/installLocalSdk.js`) and the `nocodb-sdk` build.

Net result: commit 27 carries only `build_gui.sh`.

### [29/29] Package updates — 70da07be
Files: `packages/nc-gui/package.json`, `packages/nocodb/package.json`,
`pnpm-lock.yaml`

Conflict: the fork's bulk dependency-bump commit from its 0.264.x era —
sentry 7.x→newer, tiptap, `@floating-ui/vue`, `@pinia/nuxt`, esbuild, next,
`type-fest`, etc. — collided with the release's package.json blocks everywhere,
and the fork side embeds deployment-machine dev artifacts:
`"nocodb-sdk": "link:/home/ubuntu/repos/nocodb/packages/nocodb-sdk"` and
`"nc-lib-gui": "link:../nc-lib-gui"` in both package files.

Resolution: took ours (release) for all three files (`git checkout --ours`).
The release's deps are strictly NEWER than the fork's bumps (`@sentry/vue`
`^9.2.0` vs `^7.72.0`, tiptap `^2.11.5`, `@pinia/nuxt` `^0.5.5`) and the fork's
lockfile resolutions are stale (vue 3.5.15 / magicast 0.3.5 vs the release's
vue 3.5.14 / magicast 0.5.3). With everything resolved to ours the commit went
EMPTY, and the script auto-skipped it (`git cherry-pick --skip`, "already
applied / empty").

Gotchas:
- Never graft `link:/home/ubuntu/...` (or any absolute machine path) or
  `link:../` `nc-lib-gui`/`nocodb-sdk` entries — they're the fork author's local
  dev links.
- This is the fork's last commit and is a safe candidate to DROP entirely on
  future grafts (the release supersedes the whole bulk update).
