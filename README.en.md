# dsh-biomemory

> **A memory layer for DeepSeek Harness**: one local file, zero services, zero API calls — recall driven by **trigger signals**, so the right memory shows up at the right moment.

**v0.10.0** · MIT License · DSH >= 0.1.1-rc.2 (tested on 0.2.0-rc.2 desktop) · Node >= 22.19.0

---

## What it is

In one line: **a memory layer, not a memory platform.**

- **Not**: external service, vector search, embedding models, knowledge graphs, cloud sync, web UI.
- **Is**: one SQLite file plus a deterministic rule set for "when should what be recalled".

The difference from a memory platform is not the feature count — it is that **there is nothing extra to run**. Install the plugin; the data lives in `.dsh/biomemory/biomemory.db` on your machine, and copying that file migrates your memory.

## Four layers

### 1. Storage: single-file SQLite

| Field | Meaning |
|---|---|
| `realm` | Isolation: `user` or `project:<cwd>` |
| `mtype` | Memory type: `workflow` / `error` / `decision` / `fact` |
| `trigger` | Trigger signal string (below) |
| `mkey` | Topic key used for same-key overwrite |
| `text` | The memory itself |
| `created_at` / `last_accessed` / `hits` | Lifecycle: created / last used / use count |
| `status` | `active` / `archived` / `deleted` (deletion is a **tombstone**) |

Two helper tables: `chains` (workflow chains) and `trigger_counts` (repetition counter for workflow promotion).

### 2. Recall: driven by trigger signals

The plugin does not wait for the model to "remember". It watches what is happening:

- Signals: the session working directory (`session.cwd`) plus the last 12 tool calls (names and arguments — file paths, commands, error codes).
- Three trigger shapes only, readable and explainable:
  - `file:<name>` — e.g. `file:package.json`
  - `tool:<tool>` — e.g. `tool:pwsh`
  - `err:<CODE>` — e.g. `err:MODULE_NOT_FOUND`
- On a hit, memories are injected ordered **workflow > error > decision > fact**, then by last-used time; if a workflow chain matches, the **whole chain** is injected.
- **Injection budget**: at most 8 items / 1200 characters per recall. No signal, no injection — and no tokens spent.

### 3. Cleanup: five explainable rules

Run `/memory compact`; every eviction is written to `compact.log`:

1. A newer memory with the same `realm + type + key` overwrites the older one (tombstoned) on the write path;
2. `fact`: unused (use count <= 1) for more than 30 days -> tombstone;
3. `workflow` / `error` / `decision`: no TTL, but unused for more than 90 days -> half weight;
4. `error` and `decision` are **never auto-deleted**;
5. Every eviction/demotion is logged (time, fingerprint, rule, summary).

### 4. Adaptation: workflows emerge from repetition

When the same trigger appears **more than 3 times**, related memories are promoted to `workflow` and ordered into a chain:

```
when file:package.json: read package.json -> run tests -> then edit code
```

A chain records **order, not causation** — it does not pretend to know why, only what you actually did last time.

## Install

```bash
# git required; replace --profile with your profile name
dsh plugin --profile web add github:KLRSL/dsh-biomemory

# local development (link)
dsh plugin --profile web add link:./dsh-biomemory
```

Restart DSH afterwards (the desktop app hot-mounts it).

## Usage

### Tool `memory`

| action | Description |
|---|---|
| `add` | Write a memory (`text` required; `track=user|agent`; `source` for provenance) |
| `query` | Keyword query (`text`/`topK`/`fragmentTypes`/`includeArchived`) |
| `list` / `update` / `remove` / `restore` / `pin` / `unpin` | Browse / edit / tombstone / roll back / pin / unpin |
| `compact` | Run the five rules (`dryRun=true` to preview) |
| `dump` | Export human-readable Markdown (including chains) |

A second tool, `memory_recall`, is available for explicit "do you remember..." lookups.

### Command `/memory`

```
/memory list | query <words> | add <text> | edit <fp> <text> | remove <fp> | undo <fp>
/memory pin <fp> | unpin <fp> | entries [words]
/memory compact [--dry-run] | dump
```

### Write approval

Important memories (user preferences / decisions / corrections) go through DSH's official approval. Approval is required before storing, and when the approval service is unavailable writes are **denied by default** (fail-closed; set `approvalFallback=auto` to relax).

## Data and privacy

- Fully local: no network requests, no external APIs, no telemetry.
- Database: `<DSH_BIOMEMORY_DIR || ~/.dsh/biomemory>/biomemory.db` (SQLite, WAL).
- Deletion is a tombstone (recoverable); `compact` only changes status inside the file. Use `dump` when you want a Markdown copy.
- Env vars: `DSH_BIOMEMORY_DIR` (data dir), `DSH_MEMORY_ROOT` (Markdown backup/log dir).

## Configuration

`~/.dsh/biomemory/biomemory.config.json` (or bundle config) can override:

| Key | Default | Meaning |
|---|---|---|
| `nearDuplicateThreshold` | 0.7 | Similarity threshold for write dedupe (0 = off) |
| `nearDuplicateAction` | merge | On near-duplicate: merge, or `skip` (report only) |
| `approvalFallback` | deny | Deny when approval is unavailable, or `auto` |
| `decayThreshold` | 3 | "Low weight" warning threshold |
| `hotTokenLimit` | 5000 | Token cap for the frozen snapshot injection |
| `maxQueryResults` | 20 | Query result cap |

## Deliberately not done

- **No vector/embedding search**: same input, same result; retrieval must be explainable.
- **No automated "reflection"**: without a model it does not pretend to generalise; workflows only emerge from repetition.
- **No delete-means-gone**: every deletion leaves a tombstone and can be rolled back.
- **No cross-machine sync**: that is a different product; here the file itself is portable.

## Version history

| Version | Date | Changes |
|---|---|---|
| **v0.10.0** | 2026-10-05 | **Rebuilt as a memory layer**: trigger-driven recall (`trigger`/`realm`/`mtype`/`mkey` columns), type-priority ordering, five cleanup rules with tombstones and `compact.log`, workflow promotion and chains, injection budget (<=8 items / <=1200 chars), `compact`/`dump`; **removed** dream/reflect/conflict-adjudication/audit and the automatic Markdown mirror |
| v0.9.2 | 2026-09-29 | Removed dead modules and config keys; docs aligned with implementation |
| v0.9.1 | 2026-09-29 | Removed the management UI; plugin became host-only |
| v0.9.0 | 2026-09-29 | Removed embeddings and semantic/hybrid retrieval |
| v0.8.2 | 2026-09-20 | Compliance batch: audit fixes, typed config persistence, near-duplicate dedupe |
| v0.8.0 | 2026-09-16 | Write dedupe (bigram similarity) with merge/skip strategies |
| v0.7.0 | 2026-09-17 | Mirror-sync hook (removed in v0.10.0) |
| v0.6.4 | 2026-09-06 | Single source of truth: SQLite; Markdown became read-only backup |
| v0.6.0 | 2026-08-19 | Architecture split (shared/store/retrieve/snapshot/gate) + session sediment |
| v0.5.0 | 2026-08-15 | Data layer moved to SQLite (`node:sqlite`) |

## License

MIT — see [LICENSE](LICENSE).
