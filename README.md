# dsh-biomemory · Biomimetic Memory for DeepSeek Harness

> [中文文档](README.zh-CN.md) · [English](README.md)

A cross-session memory plugin for DeepSeek Harness (DSH), designed like a human brain: layered memory, graded approval, fully transparent and editable.

- Plain Markdown data layer (default `~/.dsh/memory`, overridable via the `DSH_MEMORY_ROOT` env var) — human-readable, edit-and-take-effect
- `memory` tool: add / query / remove / list
- **Frozen snapshot injection** at session start (user preferences at top priority + recent knowledge/behavior memory)
- **Graded approval gate**: important memories (preferences/decisions/lessons) require human approval; ordinary facts are auto-saved; fails closed when no approval channel is available
- Audit log: every write is traceable
- `/memory` command: list / query / add / remove / audit
- `memory_recall` tool: cross-session recall ("do you remember…" scenarios)
- Deduplication: content fingerprint skips duplicate entries

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
└── audit.log           # Write audit
```

## Configuration

```js
// Plugin config (bundle or profile layer)
{
  petEndpoint: null // optional: local notification service URL (enables pet/notification integration, off by default)
}
```

## Compatibility

- Node >= 22.19.0
- `@deepseek-ai/dsh-*` 0.1.0-rc.5 runtime (implemented against actual lib sources)

## License

MIT
