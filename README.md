# dsh-biomemory · Biomimetic Memory for DeepSeek Harness

> [中文文档](README.zh-CN.md) · [English](README.md)

A cross-session memory plugin for DeepSeek Harness (DSH), designed like a human brain: layered memory, graded approval, memory metabolism, fully transparent and editable.

- Plain Markdown data layer (default `~/.dsh/memory`, overridable via the `DSH_MEMORY_ROOT` env var) — human-readable, edit-and-take-effect
- `memory` tool: add / query / remove / list / pin / unpin / dream / audit
- **Frozen snapshot injection** at session start (pinned memories and user preferences at top priority, then recent knowledge/behavior)
- **Graded approval gate**: important memories (preferences/decisions/lessons) require human approval; ordinary facts are auto-saved; fails closed when no approval channel is available
- Audit: human-readable `audit.log` (legacy, compatible) + structured `audit.jsonl` (JSON Lines) — every event traceable
- `/memory` command: list / query / add / remove / pin / unpin / dream / audit
- `memory_recall` tool: cross-session recall ("do you remember…" scenarios)
- Deduplication: content fingerprint skips duplicate entries
- **Memory metabolism** (`/memory dream`): half-life decay, reference consolidation, conflict arbitration, low-weight archiving — with automatic backup & rollback
- **Memory pins**: lock a memory so it never decays and always enters the snapshot
- **Semantic retrieval**: pure-JS TF-IDF + cosine — no native modules, no external dependencies

## Install

```bash
# As a local bundle in a DSH profile
dsh plugin add dsh-biomemory
# Or pnpm local link
pnpm add link:./dsh-biomemory
```

Add `dsh-biomemory` to `dsh.profile.bundles` in the profile.

## Memory Layout

```
~/.dsh/memory/
├── preferences.md      # User/project preferences (top priority, frozen-injected)
├── hot/
│   ├── knowledge.md    # L1 recent knowledge (facts/decisions)
│   └── behavior.md     # L1 recent behavior (lessons/habits/workflows)
├── projects/<name>/    # L2 project archives
├── longterm/           # L3 long-term memory
├── archive/            # Memories archived by metabolism (decayed below threshold, never deleted)
├── backups/            # Automatic backups before dream runs (rollback source)
├── audit.log           # Human-readable audit (legacy, kept for compatibility)
└── audit.jsonl         # Structured audit (JSON Lines, v0.3)
```

Each entry is a single line: `- [knowledge|auto] [fp:xxx] [w:10] [h:3] [t:2026-08-16 13:00] [pin] text`

- `w` = weight (default 10) — decay/consolidation base
- `h` = reference count — consolidation input
- `t` = write time — decay age source
- `pin` = locked (excluded from decay, always injected)

## Memory Metabolism (Dream)

`/memory dream` (or `memory action=dream`) manually triggers memory metabolism — the housekeeping a sleeping brain does:

1. **Half-life decay** (default 7 days): weight halves every half-life (`w × 0.5^(age/halfLife)`), floored at 1.
2. **Reference consolidation**: entries referenced ≥ `consolidateThreshold` (default 3) times gain +1 weight, capped at `weightCap` (default 20).
3. **Conflict arbitration**: when behavior memory conflicts with preferences, preferences win — the behavior entry's weight is halved and a `CONFLICT` audit event is recorded.
4. **Archiving**: entries whose weight drops below `decayThreshold` (default 3) move to `archive/` — moved, never deleted.

Usage:

```
/memory dream            # run metabolism
/memory dream --dry-run  # preview only, no changes
memory action=dream dryRun=true   # same via the memory tool
```

Dry-run example output:

```
【预览】扫描 120 条：衰减 12 · 巩固 3 · 冲突 0 · 归档 4
备份：（dry-run 不执行备份）
```

**Backup & rollback**: before an actual run, the whole memory store is automatically copied to `backups/<timestamp>/` (including `audit.jsonl`). On startup, the self-check restores the latest backup automatically if a primary memory file is found corrupted. Rollbacks are recorded as `ROLLBACK` audit events.

## Auto recall / auto save (v0.4.0)

Three automatic layers on top of explicit calls:

1. **Approval fallback**: important memories normally require approval; when approval is unavailable (policy `never` / service missing), they are saved automatically per `approvalFallback` (default `auto`), audited as `[降级]`. Switch to `deny` in settings to stay fail-closed.
2. **Auto consolidation (use-it-or-lose-it)**: every keyword query/recall hit bumps `hits+1` and writes back — memories that get recalled often decay slower (audit `RECALL`).
3. **Auto dream/reflect**: `autoDreamDays` (default 7) and `autoReflectDays` (default 3) run metabolism/reflection at startup when older than the interval; `0` disables. Audit `AUTO-DREAM` / `AUTO-REFLECT`.

## Deep reflection (Reflect, v0.4.0)

`/memory reflect` (or `memory action=reflect`, settings tab) — a purely local, LLM-free periodic summary:

1. **Topic clustering**: all entries clustered by TF cosine similarity (≥0.25) to surface recurring topics;
2. **Trend stats**: writes in the last 7 days vs the previous week (rising / steady);
3. **Conflict alerts**: behavior memories that clash with preferences;
4. **Forget candidates**: low-weight entries worth reviewing.

Reports are written to `longterm/reflections/<timestamp>.md`; `--dry-run` previews without writing.

## Knowledge page (v0.4.0)

The settings page gains a **Knowledge** tab: full-text/semantic search, layer filter, per-entry weight/hits/time/pin display, one-click pin/unpin and **safe removal** (backed up first, restorable). Web API: `GET /biomemory/api/entries`, `POST /biomemory/api/entries/pin|unpin|remove`, `POST /biomemory/api/reflect`.

## Memory Pins

Lock a memory so it never participates in decay and always enters the snapshot:

```
/memory pin <fp>      # lock
/memory unpin <fp>    # unlock
memory action=pin fp="xxx"
memory action=unpin fp="xxx"
```

Snapshot injection priority: **pinned > preferences > knowledge > behavior**.

## Audit

Two audit channels:

- `audit.log` — human-readable one-line summaries, backward compatible
- `audit.jsonl` — structured, one JSON object per line

Events: `WRITE`, `DECAY`, `CONSOLIDATE`, `CONFLICT`, `ARCHIVE`, `PIN`, `UNPIN`, `PREVIEW` (dry-run), `ROLLBACK`.

Example line:

```json
{"t":"2026-08-16T05:00:00.000Z","event":"DECAY","fp":"abc123","text":"..."}
```

Query:

```
/memory audit                    # recent events
/memory audit --since 7d         # last 7 days
/memory audit --type DECAY       # only DECAY events
memory action=audit type="DECAY" sinceDays=7
```

## Semantic Retrieval

Keyword matching runs first; when hits are insufficient, results are supplemented with a pure-JS TF-IDF + cosine implementation — **no native modules, no external dependencies**, fully offline. Semantic hits are marked as "semantic" in query output.

## Configuration

```js
// Plugin config (bundle or profile layer)
{
  halfLifeDays: 7,          // half-life in days for decay
  decayThreshold: 3,        // weight below this → archived
  consolidateThreshold: 3,  // references ≥ this → consolidate (+1 weight)
  weightCap: 20,            // consolidation weight cap (prevents runaway growth)
  hotTokenLimit: 5000,      // snapshot hot-section token budget
  maxQueryResults: 20,      // query result cap
  petEndpoint: null         // optional: local notification service URL (off by default)
}
```

## Compatibility

- Node >= 22.19.0
- `@deepseek-ai/dsh-*` 0.1.0-rc.5 runtime (implemented against actual lib sources)

## Troubleshooting (FAQ)

- **Node version**: requires Node >= 22.19.0; older versions may fail to load the plugin.
- **DSH runtime compatibility**: targets `@deepseek-ai/dsh-*` 0.1.0-rc.5 — check the version of the runtime you actually run.
- **Memory directory issues**: if writes fail, check read/write permissions on the memory root; if `DSH_MEMORY_ROOT` is set, it must point to an existing, writable directory.
- **Native module conflicts**: this plugin has **no native dependencies** — it is pure JS, so it cannot clash with native modules of other plugins.

## Usage Scenarios

- **Personal knowledge base, long-term maintenance**: accumulate facts and decisions over time, query them later like a second brain; decay and archiving keep the store tidy without manual pruning.
- **Project experience accumulation**: lessons, habits and decisions live per-project in `projects/<name>/`, consolidating (weight grows) as topics are referenced repeatedly.
- **Cross-session preference memory**: preferences are injected at every session start, pin important ones for stability, and let conflict arbitration keep preferences authoritative over behavior.

## Contributing

- **Report issues**: open an issue with the DSH runtime version, Node version, and reproduction steps.
- **Pull requests**: fork the repository, make the change, add/update tests, and run `npm test` before submitting.
- **Tests**: run `npm test` (node:test). New behavior should ship with test coverage.

## License

MIT
