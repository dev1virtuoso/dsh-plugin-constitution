# dsh-plugin-constitution · 工程宪法

**Memory with coherence, not retrieval.**

Existing memory plugins answer *"find that old session"*. This one answers a different question:

> When a new session starts in a project, what must the model already know **before the first token**?

A retrieval plugin makes you ask. A constitution makes the model already know — global engineering
philosophy, domain conventions, and per-project law are resolved against the session's working
directory and rebuilt into the system prompt at every step. No search. No re-feeding. No "as I
mentioned in the other tab".

```
~/.dsh-constitution/
├── constitution.md            # 全局：工程哲学（所有会话）
├── domains/
│   └── cad.md                 # 领域包：match 命中时才注入
└── projects/
    └── gear-box.md            # 项目法：只对这个工作目录生效
```

## Why it is not another retrieval plugin

| | Retrieval memory (`dsh-memory`, `dsh-ltm`, …) | Constitution |
|---|---|---|
| Trigger | model must decide to search | none — always resolved |
| Shape | documents found by similarity | ordered law, explicit priority |
| Cross-project | one more haystack | layered scopes, domain packs match by signal |
| Lifetime | a past conversation | a rule that outlives every conversation |
| Cost when idle | index + queries | one cached read per working directory |

The important part is the **injection point**. The section is registered with
`ctx.systemPrompt.section()` and evaluated on every assembly, so:

- it is present in the very first request of a new session (nothing to remember to do);
- it survives compaction, because it is rebuilt rather than stored;
- it never enters the durable log, so it cannot pollute the transcript;
- edits to the Markdown take effect within `refreshMs`, mid-session;
- subagents and forked sessions inherit it too — they share the working directory.

## Install

From this directory:

```sh
# In DSH: Plugins → Add plugin → pick this folder
```

or ask the agent to install the bundle from its absolute path. The bundle installs into the current
profile, so every session in that profile sees it.

After install, the first activation seeds `~/.dsh-constitution/constitution.md` with a starter corpus
(disable with `seed: false`).

## Layers and how they are chosen

Layers are read in this order and rendered in this order; on conflict the **later, more specific**
layer wins:

| Layer | Files | Applies when |
|---|---|---|
| `core` | `<root>/constitution.md` | always |
| `domain` | `<root>/domains/*.md` | a front-matter `match` token occurs in the project signature |
| `project` | `<root>/projects/*.md` | a front-matter `match` token occurs in the signature, or (with no front matter) the file name matches the working directory's name |
| `workspace` | `<cwd>/.dsh/constitution.md` | the file exists — commit it with the repo to share law with teammates |

The **project signature** is a lowercase haystack of: the working directory path, its segments, the
extensions of its top-level files, and `package.json` `name` + `keywords` when present.

```md
---
match: cad, 机械, .step, .sldprt, gear
title: 机械结构
---

# 机械结构 · domain constitution

## 验收
- 所有关键尺寸标注公差，默认 ±0.2mm；结构间隙按 ±5mm 验收。
```

## Tools

| Tool | Purpose |
|---|---|
| `constitution_read` | exact text + source file of every layer in force; filter by `layer` or `name` |
| `constitution_learn` | persist a long-term rule into `core`, `domain`, or `project` — the loop that makes the corpus grow instead of being re-explained |
| `constitution_status` | resolved layers, sizes, budget, injected length — debug *why a rule did (not) apply* |

`constitution_learn` is what turns a one-off instruction into law:

> "以后所有公差都按 ±5mm 验收，别再问" → `constitution_learn(text="关键尺寸按 ±5mm 验收", layer="project")`

## Config

Set keys in the bundle's row config (`cordis.patch.yml` → `config:`):

| Key | Default | Meaning |
|---|---|---|
| `root` | `~/.dsh-constitution` | corpus directory |
| `maxChars` | `6000` | hard budget for the injected section; lower-priority layers are dropped whole and listed as omitted |
| `order` | `8900` | system-prompt section order |
| `seed` | `true` | write the starter corpus when the root is missing |
| `language` | `"auto"` | wrapper language: `auto` (detect from the corpus), `zh`, or `en` |
| `refreshMs` | `2000` | per-working-directory cache lifetime |
| `maxFileBytes` | `65536` | largest layer file read |

Unknown keys fail at activation instead of being silently ignored.

## Boundaries

- The corpus is read with Node's filesystem directly, not through the sandboxed `fs` tool: it is the
  user's own memory directory. `constitution_learn` writes there too, so a read-only home directory
  degrades to read-only behavior rather than an error.
- Only direct children of `domains/` and `projects/` are read (no recursion), `.md` only.
- Interpolation is off for this section, so `{{...}}` in your text is literal.
- The section is deployment-owned prompt text; a composition that installs a `complete` prompt
  section replaces it.
- Budget exhaustion drops whole layers instead of truncating mid-rule, and says which ones — use
  `constitution_read` to fetch them.

## License

MIT.
