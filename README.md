# dsh-biomemory · Biomimetic Memory for DeepSeek Harness

> [English](README.md) · [中文文档](README.zh-CN.md)

> **Version v0.6.3** · MIT License · **Compatibility**: DeepSeek Harness ≥ 0.1.1-rc.2 (verified on 0.1.2-rc.1) · Node ≥ 22.19.0

A cross-session memory plugin for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) (DSH) that works like a human brain: **layered recall, graded review, memory metabolism, fully transparent and editable**. The data layer is SQLite (built-in `node:sqlite`, WAL mode, zero external dependencies); legacy Markdown memories are migrated automatically on first start and kept as a read-only backup.

## ✨ Features

| Capability | Description |
| --- | --- |
| Layered memory | Three layers — Memory (store), Retrieved (query candidates), Applied (injected snapshot). Retrieved ≠ adopted; the model decides how to use them in context |
| Graded approval | Important memories (user preferences / project decisions / lessons learned) require human approval; ordinary facts are saved automatically. Falls back per `approvalFallback` (auto / deny) when no approval channel exists |
| Automatic consolidation | A "consolidate this turn" directive is injected after each turn ends; a **frozen snapshot** is injected at session start (pinned memories and preferences first, conflicting behavior entries surfaced and marked `[conflict]`) |
| Memory metabolism | Half-life decay + reference consolidation (use-it-or-lose-it) + conflict exemption + low-weight archiving; automatic backup before runs, checkpoint resume, and dry-run preview |
| Deep reflection | Topic clustering / trend statistics / conflict alerts / forget candidates — purely local, no LLM; reports written to `longterm/reflections/` |
| Memory classes | Auto-inferred `memory_class`: user_decision / user_preference / fact / model_suggestion / model_inference (a suggestion ≠ a decision) |
| Source traceability | `source_ref` records provenance (`session:<id>` by default); structured audit log with a 5-tuple (time / actor / event / entry / detail) |
| Semantic retrieval | Local embedding model bge-small-zh-v1.5 (512-dim, offline) when available; pure-JS TF-IDF + cosine fallback; exact / semantic / hybrid modes |
| Fully editable | Every entry can be edited, removed, or restored (database backed up before removal); a single `.db` file holds everything and can be inspected with standard tools |
| Native-module free | `node:sqlite` built-in + pure JS — no native module conflicts; five-tab "Memory Workbench" admin UI follows the DSH theme including dark mode |

## 📦 Installation

```bash
# Install into a DSH profile
dsh plugin add dsh-biomemory

# Or link a local checkout during development
pnpm add link:./dsh-biomemory
```

Then register `dsh-biomemory` in `dsh.profile.bundles` of your profile and restart DSH.

**Post-install verification**:

```bash
# 1. Tool registered — call it from a session (visible to the model)
memory action=query text="test"

# 2. Data layer ready — should appear after the first start
ls ~/.dsh/biomemory/
# biomemory.db  biomemory.db-wal  biomemory.db-shm

# 3. Legacy Markdown memories migrated automatically (kept as read-only backup)
#    Check migration status via the Web API:
#    GET /biomemory/api/status → migration field

# 4. Admin UI — the "Memory Workbench" appears in DSH settings with five tabs:
#    Overview / Knowledge / Metabolism / Reflect / Settings
```

## 🚀 Quick Start

```text
# ① Save a user preference (important memory → human approval; stored once approved)
memory action=add track=user text="User prefers domestic mirrors for downloads" source="user statement"

# ② Query (hybrid = exact + semantic fusion, the default)
memory action=query text="mirror" mode=hybrid topK=5

# ③ Correct an entry (text only; metadata preserved)
memory action=update fp="a1b2c3" text="User prefers domestic mirrors (Tsinghua pip / npmmirror)"

# ④ Pin an important entry (exempt from decay, always in the session snapshot)
memory action=pin fp="a1b2c3"

# ⑤ Run metabolism + reflection (use --dry-run to preview first)
memory action=dream dryRun=true
memory action=reflect dryRun=true

# ⑥ Audit (what has the memory system been doing lately?)
memory action=audit sinceDays=7
memory action=audit aggregate=true groupBy=action

# ⑦ The /memory command family is also available at runtime
/memory list
/memory query preference
```

## 🧠 Usage Guide

### memory tool (action reference)

| Action | Parameters | Description |
| --- | --- | --- |
| `add` | `text` (required), `track`=user\|agent, `source` | Save a memory; important entries request approval, falling back per `approvalFallback` |
| `query` | `text`, `mode`=hybrid\|exact\|semantic, `topK`, `minWeight`, `projectId`, `fragmentTypes`, `includeArchived` | Retrieve; hits are consolidated (use-it-or-lose-it) |
| `update` | `fp`, `text` | Edit an entry (metadata such as pin/weight preserved; stale vector cleared; `UPDATE` audited) |
| `remove` | `fp` | Delete an entry (database backed up first; restorable) |
| `restore` | `fp` | Restore a deleted entry from the newest backup |
| `list` | `topK` | List all entries; behavior memories conflicting with preferences are surfaced at the top |
| `pin` / `unpin` | `fp` | Lock / unlock. Pin = no-forgetting only (exempt from decay/archive); it does not imply mandatory application every turn |
| `dream` | `dryRun`, `resume` (default true) | Metabolism: decay / consolidation / conflict / archiving; checkpoint-resumable |
| `reflect` | `dryRun` | Deep reflection: topic clustering / trends / conflict alerts / forget candidates |
| `audit` | `type`, `sinceDays`, `aggregate`, `groupBy` (action\|day\|entry) | Structured audit queries and aggregation |

Examples:

```text
memory action=add track=user text="The official name is 'DaFeiYu'; do not use old names" source="user statement"
memory action=query text="UI rendering width rules" mode=hybrid topK=10 minWeight=0.1 fragmentTypes=decision,preference
memory action=audit type="DECAY" sinceDays=7
memory action=audit aggregate=true groupBy=day
```

**Memory classes (auto-inferred at write time)**: `user_decision` (explicit user decision) · `user_preference` (user preference) · `fact` (ordinary fact) · `model_suggestion` (model suggestion) · `model_inference` (model inference). A suggestion ≠ a decision — model suggestions must never impersonate decisions the user made.

### memory_recall tool

Cross-session recall for "do you remember…" scenarios; same backend as `memory query`, semantically specialized for recollection:

```text
memory_recall text="the versioning rules we settled on"
```

### The /memory command family

| Command | Description |
| --- | --- |
| `/memory list` | List all entries (conflicts surfaced at the top) |
| `/memory query <term>` | Keyword + semantic search |
| `/memory add <content>` | Write directly (human-initiated, no approval) |
| `/memory edit <fp> <new text>` | Edit an entry |
| `/memory remove <fp>` | Delete an entry (restorable) |
| `/memory undo <fp>` | Restore a deleted entry |
| `/memory pin <fp>` / `unpin <fp>` | Pin / unpin |
| `/memory entries [term]` | List entries (optional filter term) |
| `/memory dream [--dry-run]` | Run metabolism |
| `/memory reflect [--dry-run]` | Run deep reflection |
| `/memory audit [--since 7d] [--type DECAY]` | Audit query |

### Frozen snapshot injection

At session start the plugin freezes high-value memories into the system prompt (registered and frozen at startup, marked "session frozen"):

- The header states the three-layer model explicitly: **this snapshot = Applied Context** (already injected); Memory (store) and Retrieved (query candidates) are not included; **retrieved ≠ adopted**.
- Injection order: **pinned memories (top priority, exempt from decay) → user preferences (top priority) → recent knowledge → recent behavior**.
- Behavior memories conflicting with preferences are **surfaced at the top with a `[conflict]` marker** for you to resolve.
- A hot-section token budget `hotTokenLimit` (default 5000) applies; preferences and pinned entries are retained first when truncated.

### Graded approval gate

| Memory type | Approval mode |
| --- | --- |
| User preferences / project decisions / lessons (`track=user` or important keywords) | **Human approval** (ask) |
| Ordinary facts | Automatic (auto) |
| No approval channel (policy `never` / service missing) | Per `approvalFallback`: `auto` = save with a degraded-audit marker · `deny` = reject (fail-closed) |

### Memory metabolism (Dream)

Runs when your sleeping brain does its housekeeping — `/memory dream` or `memory action=dream`:

1. **Half-life decay** (default 7 days): `w × 0.5^(age/halfLife)`, floored at 1.
2. **Reference consolidation**: entries referenced ≥ `consolidateThreshold` (default 3) times gain +1 weight, capped at `weightCap` (default 20).
3. **Conflict exemption**: behavior memories conflicting with preferences are neither decayed nor archived — they stay active and float to the top of listings and the snapshot for **your** judgment; editing the conflict away restores normal metabolism. A `CONFLICT` event is recorded.
4. **Archiving**: entries below `decayThreshold` (default 3) get `status=archived` — moved, never deleted.

The database is backed up automatically before a run (last 7 kept, `ROLLBACK` auditable); checkpoints are written every 100 entries so an interrupted run resumes with `resume=true`; `--dry-run` previews without writing.

### Deep reflection (Reflect)

Purely local, LLM-free periodic review: **topic clustering** (TF cosine similarity ≥ 0.25) · **trend stats** (last 7 days vs the previous week) · **conflict alerts** (potential behavior-vs-preference clashes) · **forget candidates** (low-weight entries). Reports go to `longterm/reflections/<timestamp>.md`; `--dry-run` previews without writing.

### Knowledge base (admin UI)

The "Memory Workbench" in DSH settings has five tabs:

| Tab | Function |
| --- | --- |
| Overview | Store statistics (entries / pinned / layers / vectors / 7-day audit), model status, migration status, conflict and low-weight summaries |
| Knowledge | Full-text / semantic search (exact / semantic / hybrid), layer filter, weight / hits / time / pin status; one-click pin/unpin, **inline editing**, **safe removal** (backed up first, restorable); conflict entries surfaced with a red badge |
| Metabolism | One-click run / preview of metabolism with decay / consolidation / conflict / archive results |
| Reflect | One-click run / preview of reflection; report listing with inline conflict resolution (edit or delete) |
| Settings | Visual editing of every configuration option (including reset to defaults) |

### Audit

Two channels: the **SQLite `audit_log` table** (structured, 5-tuple `t / actor / action / entry_id / detail`, primary) + **`audit.log`** (human-readable one-line summaries, backward compatible).

Event types: `WRITE` / `DECAY` / `CONSOLIDATE` / `CONFLICT` / `ARCHIVE` / `RECALL` / `ROLLBACK` / `AUTO-DREAM` / `AUTO-REFLECT` (auxiliary: `PIN` / `UNPIN` / `UPDATE` / `REMOVE` / `RESTORE` / `MIGRATE` / `VECTORIZE` / `PREVIEW` / `REFLECT` / `CONFIG`).

```text
/memory audit                      # recent events
/memory audit --since 7d           # last 7 days
/memory audit --type DECAY         # DECAY only
memory action=audit type="DECAY" sinceDays=7
memory action=audit aggregate=true groupBy=action   # aggregated stats
```

### Semantic retrieval

Keyword matching runs first; when hits are insufficient, a pure-JS **TF-IDF + cosine** implementation supplements recall (no native modules, fully offline). When the local embedding model (bge-small-zh-v1.5, 512-dim, at `~/.dsh/models/`) is available, retrieval upgrades to **hybrid** fusion (RRF variant); if the model is missing or fails to load, retrieval degrades to keyword search and memory features remain unaffected. Semantic hits are marked "semantic" in output.

## ⚙️ Configuration

| Key | Default | Description |
| --- | --- | --- |
| `halfLifeDays` | `7` | Half-life (days): weight halves every half-life |
| `decayThreshold` | `3` | Weight below this → archived (moved, never deleted) |
| `consolidateThreshold` | `3` | References ≥ this → consolidate (+1 weight) |
| `weightCap` | `20` | Consolidation weight cap (prevents runaway growth) |
| `hotTokenLimit` | `5000` | Snapshot hot-section token budget |
| `maxQueryResults` | `20` | Query result cap |
| `approvalFallback` | `auto` | When approval is unavailable: `auto` = save with degraded-audit marker / `deny` = reject |
| `autoDreamDays` | `7` | Auto-run metabolism at startup if older than this many days (`0`=off) |
| `autoReflectDays` | `3` | Auto-run reflection at startup if older than this many days (`0`=off) |
| `conflictOverlap` | `3` | Conflict detection: proprietary bigram overlap threshold between behavior and a single preference |
| `petEndpoint` | `null` | Optional: local desktop-pet notification service URL (off by default) |

Editable in the Settings tab, or via `POST /biomemory/api/config`; persisted as `biomemory.config.json` (fully transparent).

## 🔌 Integration

### Web API (registered on DshWebServer, prefix `/biomemory/api`)

| Method / Path | Description |
| --- | --- |
| `GET /status` | Store statistics + config + model/migration status |
| `GET /config` · `POST /config` | Read / update configuration (whitelisted fields; `reset:true` restores defaults) |
| `POST /dream` | Run metabolism (body `{ "dryRun": true }`) |
| `POST /reflect` | Run deep reflection (body `{ "dryRun": true }`) |
| `GET /entries` | List entries (`q` query / `layer` layer / `mode` retrieval mode / `limit` cap) |
| `POST /entries/pin` · `/unpin` · `/remove` · `/restore` · `/update` | Entry management (body carries `fp` etc.) |
| `POST /vectors` · `GET /vectors` | Trigger vectorization / query vectorization status |
| `GET /audit` · `GET /audit/aggregate` | Audit query (`sinceDays`/`type`) / aggregation (`groupBy`) |

### Notifications (optional)

After configuring `petEndpoint`, memory-save events are pushed to a local desktop-pet bubble over HTTP POST (silent failure when the pet is offline; memory itself is unaffected).

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DSH_BIOMEMORY_DIR` | `~/.dsh/biomemory` | SQLite data directory |
| `DSH_MEMORY_ROOT` | `~/.dsh/memory` | Legacy Markdown root (migration source & read-only backup) |
| `DSH_MODELS_ROOT` | `~/.dsh/models` | Local embedding model directory |
| `DSH_MEMORY_DEBUG` | — | Writes debug logs when set to `1` |

## 🛡 Compatibility

- **Node ≥ 22.19.0** (requires built-in `node:sqlite`).
- **Runtime**: `@deepseek-ai/dsh-*` ≥ 0.1.1-rc.2 (current latest line; verified on 0.1.2-rc.1, implemented against actual lib sources).
- **peerDependencies**: `@deepseek-ai/cordis ^4.0.2`, `@deepseek-ai/dsh-session >= 0.1.1-rc.2`, `@deepseek-ai/dsh-tools >= 0.1.1-rc.2`.
- **Zero native npm dependencies**: the data layer is built-in `node:sqlite` plus pure JS, so it cannot clash with other plugins' native modules; the embedding model is an optional offline component that degrades gracefully when missing.
- Since v0.6.3, memory tool return values are compatible with dsh-tools' new strict lossless JSON validation (undefined/NaN fields are normalized to null, fixing tool validation errors).

## 📜 Version History

### v0.6.3 (2026-09-05) · Compatibility · Theme

- Adapted to DSH 0.1.2-rc.1: memory tool return values compatible with the new dsh-tools lossless JSON validation (undefined/NaN fields normalized to null, fixing tool errors).
- Plugin UI dark-mode adaptation: follows DSH theme `--dsw-alias-*` variables with dual-channel detection on `body[data-ds-dark-theme]` and a MutationObserver for live switching.

### v0.6.2 (2026-09-05) · UI rebuild

- Admin UI rebuilt on the "skeleton/flesh/breath" design language: modern minimalism — neutralSurface `#F5F6F8` base with white rounded cards (max-width 880 centered), primary-underline tabs, 4/8px grid, 150ms restrained motion, type scale 12/14/16/20/28.
- Colors taken entirely from dsh-fuse design tokens (primary `#2563EB` / accent `#0EA5E9` / border `#E5E7EB` / text `#1A1A1A`), zero hardcoded values; purple-pink brand color established (memory neurons).

### v0.6.1 (2026-09-05) · Cognitive hygiene · Traceability

- Memory / Retrieved / Applied three-layer separation (retrieved ≠ adopted).
- Pin semantics corrected: pin = no-forgetting + relevance admission (latest explicit user decision wins on conflict).
- Memory classes `memory_class` (user_decision / user_preference / fact / model_suggestion / model_inference; suggestion ≠ decision) + `source_ref`.
- Schema evolution: new columns in `entries`, idempotent automatic ALTER for existing databases.

### v0.6.0 (2026-08-31) · Architecture refactor · Auto-consolidation

- `index.mjs` split into shared / store / retrieve / meta / snapshot / gate / notify / session-state modules (no behavior change; 57 tests green).
- Session-end auto-consolidation: a "consolidate this turn" directive is injected after `turn/end`; the model writes via `memory add`; marker cleared on write, 5-minute stale guard, strict deduplication.
- Fixes: `files` whitelist now covers all new modules (prevents `ERR_MODULE_NOT_FOUND` after publishing); `/reflect` `/dream` endpoints read `dryRun` from the request body.

### v0.5.3 (2026-08-31) · UI modernization

- Settings page moved to dsh-fuse design tokens (modern minimalism: neutralSurface base + white cards, primary `#2563EB`, 4/8px grid); peerDeps bumped to `>=0.1.1-rc.1`.

### v0.5.2 (2026-08-20) · Editing · Conflict surfacing · Rollback

- Editable memories (`update` preserves pin/weight, audits `UPDATE`, rejects duplicates) + conflict surfacing (behavior-vs-preference conflicts surfaced at the top for judgment instead of silent weight reduction).
- Single-entry rollback (`restore` / `/memory undo`; restores from the newest backup, vector cleared for recomputation, `RESTORE` audited).

### v0.5.0 (2026-08-20) · Data-layer overhaul

- SQLite data layer (`~/.dsh/biomemory/biomemory.db`, built-in node:sqlite, WAL, zero external deps) + local embedding semantic retrieval (bge-small-zh-v1.5, 512-dim, offline).
- Automatic migration of legacy Markdown memories (kept as read-only backup) + audit aggregation (by action/day/entry) + checkpoint-resumable dream.

### v0.4.0 · Automation · Reflection · Knowledge page

- Automatic recall (hit consolidation, use-it-or-lose-it) / automatic saving (approval fallback + auto metabolism/reflection cycles) + deep reflection + knowledge page (settings tab).

### v0.3.x · Foundation

- Memory metabolism (dream) + memory pins + structured audit (audit.jsonl) + semantic retrieval (TF-IDF) + settings panel.

## ❓ FAQ

- **Node version**: Node ≥ 22.19.0 is required (built-in `node:sqlite`); older versions may fail to load the plugin.
- **DSH runtime compatibility**: targets `@deepseek-ai/dsh-*` ≥ 0.1.1-rc.2 — verify the runtime version you actually run (0.1.2-rc.1 verified).
- **Tool errors (Invalid object / lossless JSON)**: upgrade to v0.6.3+ — return values are now compatible with the new strict validation.
- **Semantic retrieval unavailable**: check that the model exists at `~/.dsh/models/bge-small-zh-v1.5`; when missing, retrieval degrades to keyword + TF-IDF and memory features keep working.
- **Write failures**: check read/write permissions for `~/.dsh/biomemory/` (and `DSH_BIOMEMORY_DIR`); if approval is rejected, check the approval policy and `approvalFallback`.
- **Where did my legacy Markdown memories go?**: they were migrated into SQLite automatically on first start; `~/.dsh/memory/` remains as a read-only backup and is not deleted.
- **Can a deleted entry be recovered?**: the database is backed up before each removal (last 7 kept) — run `/memory undo <fp>` or `memory action=restore fp=...`.
- **Native module conflicts**: this plugin has none — it is implemented in pure JS and cannot conflict with other plugins.

## 🧪 Development

```bash
# Run the test suite (node:test, 60 tests, all green)
npm test
```

Module layout: `index.mjs` (wiring layer) + `shared` (config/audit/conflict) · `store` (write/pin/remove/restore/migration) · `retrieve` (query/semantic) · `meta` (metabolism/reflection) · `snapshot` (snapshot/session consolidation) · `gate` (approval/self-heal) · `notify` (desktop-pet notifications) · `session-state` · `db` (SQLite data layer) · `embed` (embedding model).

**Contributing**: fork → change → add/update tests → run `npm test` before submitting. Please include the DSH runtime version, Node version, and reproduction steps when reporting issues.

## 📄 License

MIT — see [LICENSE](LICENSE) for the full text.

> Copyright © 2026 dsh-biomemory contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the conditions in the LICENSE file.
