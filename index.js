/**
 * Constitution — engineering memory with coherence, not retrieval.
 *
 * Retrieval plugins answer "find that old code". This one answers a different
 * question: when a NEW session starts in a project, what must it already know
 * before the first token? A layered, user-owned corpus — global engineering
 * philosophy, domain packs, project law — is resolved against the session's
 * working directory and rendered into the system prompt on every assembly, so
 * every new session (and every subagent) inherits it with no user action and
 * no search step.
 *
 * Because the section is rebuilt at assembly time it is never compacted away,
 * never duplicated into the log, and reflects edits made between turns.
 *
 * @module dsh-plugin-constitution
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

/** Stable Cordis plugin name. */
export const name = 'constitution'

/** Prompt registry and tool registry are both required. */
export const inject = ['systemPrompt', 'tools']

/** Registry name of the injected system-prompt section. */
const SECTION = 'constitution:engineering'

/** Front matter is a restricted `key: value` block; only `match` and `title` are read. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Directories under the root that hold the non-core layers. */
const DOMAIN_DIR = 'domains'
const PROJECT_DIR = 'projects'

/** Workspace-committed layer, read relative to the session's working directory. */
const WORKSPACE_LAYER = path.join('.dsh', 'constitution.md')

/** Defaults; every key is overridable from the bundle's `config`. */
const DEFAULTS = {
  root: path.join(os.homedir(), '.dsh-constitution'),
  maxChars: 6000,
  order: 8900,
  seed: true,
  language: 'auto',
  refreshMs: 2000,
  maxFileBytes: 65536,
}

/** Model-facing wrappers, one vocabulary per language. */
const TEXT = {
  zh: {
    heading: '## 工程憲法 · Constitution（跨會話自動繼承）',
    lead: '下列約束是這個項目的長期法律，由用戶的記憶插件在本會話開始前自動注入。沒有人在本次對話裡重複交代它們，但它們與本次請求同樣有效。',
    rules: [
      '優先級：workspace > 項目 > 領域 > 全局；同一主題相互衝突時，以優先級高者為準。',
      '數值驗收標準（例如 ±5mm）、命名、目錄結構、代碼風格與物理/工程約束一律按憲法執行；確有必要偏離時，先說明理由，再取得用戶同意。',
      '需要完整原文（下文可能因字數預算被裁剪）時調用 constitution_read；發現新的長期約束時調用 constitution_learn 沉澱下來，而不是只在本次會話裡遵守。',
    ],
    truncated: '以下層因超出字數預算未注入，需要時用 constitution_read 讀取：',
    matched: '匹配',
    empty: '憲法目錄為空。用 constitution_learn 寫入第一條長期約束。',
    priority: { workspace: '工作區', project: '項目', domain: '領域', core: '全局' },
  },
  en: {
    heading: '## Engineering constitution (inherited across sessions)',
    lead: 'The rules below are this project\'s long-lived law. A memory plugin injected them before this session began; nobody restated them in this conversation, and they bind this request exactly as if they had.',
    rules: [
      'Priority: workspace > project > domain > global. When two layers disagree, the higher-priority one wins.',
      'Numeric acceptance criteria (for example ±5mm), naming, layout, code style, and physical or engineering constraints are followed as written. Deviate only after stating why and getting the user\'s agreement.',
      'Call constitution_read for full text when a layer below was trimmed for budget; call constitution_learn to persist a newly discovered long-term constraint instead of merely obeying it for this session.',
    ],
    truncated: 'Omitted for the character budget — read with constitution_read:',
    matched: 'matched',
    empty: 'The constitution directory is empty. Write the first long-term constraint with constitution_learn.',
    priority: { workspace: 'workspace', project: 'project', domain: 'domain', core: 'global' },
  },
}

/**
 * Validate and default the plugin's config.
 * @param config - raw row config from `cordis.patch.yml`.
 * @returns a detached, validated config.
 * @throws when a key is unknown or a value has the wrong type.
 */
function resolveConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const unknown = Object.keys(raw).filter(key => !(key in DEFAULTS))
  if (unknown.length > 0) {
    throw new Error(`constitution: unknown config key(s) ${unknown.join(', ')} — accepted keys are ${Object.keys(DEFAULTS).join(', ')}`)
  }
  const resolved = { ...DEFAULTS, ...raw }
  if (typeof resolved.root !== 'string' || resolved.root.trim() === '') {
    throw new Error('constitution: `root` must be a non-empty path string')
  }
  resolved.root = path.resolve(resolved.root)
  for (const key of ['maxChars', 'order', 'refreshMs', 'maxFileBytes']) {
    const value = resolved[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`constitution: \`${key}\` must be a non-negative finite number`)
    }
  }
  if (!['auto', 'zh', 'en'].includes(resolved.language)) {
    throw new Error('constitution: `language` must be "auto", "zh", or "en"')
  }
  resolved.seed = resolved.seed !== false
  return resolved
}

/** The Chinese seed corpus written when the root directory does not exist yet. */
const SEED_ZH = `# 工程憲法 · Global constitution

> 這一層對**所有**會話生效。寫"工程哲學"，不要寫某個項目的一次性細節。
> 每行一條規則，用 \`-\` 開頭；越具體越容易被遵守（可驗證 > 模糊）。

## 交付標準
- 任何尺寸/公差我都要求給出可驗證的驗收區間（例如 ±5mm），不要只說"差不多"。
- 結論先給，驗證過程（跑了什麼、看到什麼）附在後面。

## 工程風格
- 先能跑通再談優雅；第一版交付必須可執行、可驗證。
- 改動前先讀現有實現；不要用推測代替閱讀。
- 破壞性操作先確認，再執行。

## 已知邊界
- 不確定的地方直接說"未驗證"，不要編造。
`

/** The English seed corpus. */
const SEED_EN = `# Global constitution

> This layer applies to **every** session. Write engineering philosophy here, not one project's details.
> One rule per line, starting with \`-\`; the more verifiable a rule is, the more reliably it is followed.

## Acceptance
- Every dimension and tolerance I ask for must come with a verifiable band (for example ±5mm), not "close enough".
- Lead with the conclusion; put the evidence (what you ran, what you saw) after it.

## Engineering style
- Make it work before making it elegant; a first delivery must run and be checkable.
- Read the existing implementation before changing it; never substitute inference for reading.
- Confirm destructive operations before running them.

## Known limits
- Say "not verified" where something is unverified; do not invent.
`

/**
 * Whether this host is likely to prefer Chinese text.
 * @returns true for a CJK system locale.
 */
function prefersChinese() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? ''
    return /^(zh|ja|ko)/i.test(locale)
  } catch {
    return false
  }
}

/**
 * The seed corpus for the configured language.
 * @param resolved - validated config.
 * @returns Markdown seed text.
 */
function seedText(resolved) {
  if (resolved.language === 'zh') return SEED_ZH
  if (resolved.language === 'en') return SEED_EN
  return prefersChinese() ? SEED_ZH : SEED_EN
}

/**
 * Split an optional front-matter header from a Markdown document.
 * @param raw - full file text.
 * @returns the parsed `match`/`title` metadata and the body.
 */
function parseDocument(raw) {
  const meta = { match: [], title: undefined }
  const header = FRONT_MATTER.exec(raw)
  if (header === null) return { meta, body: raw.trim() }
  for (const line of header[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (pair === null) continue
    const key = pair[1].toLowerCase()
    const value = pair[2].trim().replace(/^["']|["']$/g, '')
    if (key === 'match') {
      meta.match = value.split(',').map(token => token.trim().toLowerCase()).filter(token => token !== '')
    } else if (key === 'title' && value !== '') {
      meta.title = value
    }
  }
  return { meta, body: raw.slice(header[0].length).trim() }
}

/**
 * Read one Markdown file safely.
 * @param file - absolute path.
 * @param maxBytes - largest accepted file.
 * @returns the file text, or undefined when it is absent or unreadable.
 */
function readTextFile(file, maxBytes) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return undefined
    if (stat.size > maxBytes * 8) return undefined
    const text = fs.readFileSync(file, 'utf8')
    return text.length > maxBytes ? text.slice(0, maxBytes) : text
  } catch {
    return undefined
  }
}

/**
 * List the Markdown files directly inside a directory, in stable order.
 * @param dir - absolute directory.
 * @returns file names, or an empty list when the directory is absent.
 */
function listMarkdown(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.md$/i.test(entry.name))
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * A short, filesystem-safe identity for a display name, including names that
 * contain no ASCII letters (for example Chinese project directories).
 * @param input - raw name.
 * @returns a lowercase id usable as a file name.
 */
function stableId(input) {
  const text = String(input)
  const slug = text.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '')
  if (slug !== '') return slug
  return `p-${createHash('sha1').update(text).digest('hex').slice(0, 8)}`
}

/**
 * Build the lowercase haystack a layer's `match` tokens are tested against:
 * the working directory, its segments, its top-level file extensions, and the
 * project's own package name and keywords when it has a manifest.
 * @param cwd - session working directory.
 * @returns one lowercase string.
 */
function signature(cwd) {
  const parts = [cwd.toLowerCase()]
  const extensions = new Set()
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true }).slice(0, 400)
    for (const entry of entries) {
      if (entry.isDirectory()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (extension !== '') extensions.add(extension)
      if (entry.name !== 'package.json') continue
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
        if (typeof manifest.name === 'string') parts.push(manifest.name.toLowerCase())
        if (Array.isArray(manifest.keywords)) {
          for (const keyword of manifest.keywords) parts.push(String(keyword).toLowerCase())
        }
      } catch {
        // A malformed manifest contributes nothing; the directory still matches by name.
      }
    }
  } catch {
    // An unreadable directory still matches by its own path.
  }
  return `${parts.join(' ')} ${[...extensions].join(' ')}`
}

/**
 * Whether any match token occurs in the signature.
 * @param tokens - lowercase tokens from front matter.
 * @param haystack - result of {@link signature}.
 * @returns the tokens that matched.
 */
function matchedTokens(tokens, haystack) {
  return tokens.filter(token => haystack.includes(token))
}

/**
 * Collect every layer that applies to one working directory.
 * @param resolved - validated config.
 * @param cwd - session working directory.
 * @returns applicable layers in reading order (global, domain, project, workspace).
 */
function collectLayers(resolved, cwd) {
  const layers = []
  const coreFile = path.join(resolved.root, 'constitution.md')
  const core = readTextFile(coreFile, resolved.maxFileBytes)
  if (core !== undefined && core.trim() !== '') {
    layers.push({ layer: 'core', id: 'constitution', file: coreFile, text: core.trim(), matchedOn: [] })
  }

  const haystack = signature(cwd)
  const domainDir = path.join(resolved.root, DOMAIN_DIR)
  for (const file of listMarkdown(domainDir)) {
    const full = path.join(domainDir, file)
    const raw = readTextFile(full, resolved.maxFileBytes)
    if (raw === undefined) continue
    const { meta, body } = parseDocument(raw)
    if (body === '') continue
    const hits = meta.match.length === 0 ? [] : matchedTokens(meta.match, haystack)
    if (meta.match.length > 0 && hits.length === 0) continue
    layers.push({
      layer: 'domain',
      id: file.replace(/\.md$/i, ''),
      title: meta.title,
      file: full,
      text: body,
      matchedOn: hits,
    })
  }

  const projectDir = path.join(resolved.root, PROJECT_DIR)
  const projectName = path.basename(cwd) || cwd
  const projectKey = stableId(projectName)
  for (const file of listMarkdown(projectDir)) {
    const full = path.join(projectDir, file)
    const raw = readTextFile(full, resolved.maxFileBytes)
    if (raw === undefined) continue
    const { meta, body } = parseDocument(raw)
    if (body === '') continue
    const id = file.replace(/\.md$/i, '')
    const tokens = meta.match.length > 0 ? meta.match : [projectKey, projectName.toLowerCase()]
    const hits = matchedTokens(tokens, haystack)
    if (hits.length === 0) continue
    layers.push({ layer: 'project', id, title: meta.title, file: full, text: body, matchedOn: hits })
  }

  const workspaceFile = path.join(cwd, WORKSPACE_LAYER)
  const workspace = readTextFile(workspaceFile, resolved.maxFileBytes)
  if (workspace !== undefined && workspace.trim() !== '') {
    layers.push({
      layer: 'workspace',
      id: 'constitution',
      file: workspaceFile,
      text: workspace.trim(),
      matchedOn: [],
    })
  }
  return layers
}

/** How much a layer is worth keeping when the budget runs out; lower survives. */
const PRIORITY = { workspace: 0, project: 1, domain: 2, core: 3 }

/** Reading order once the kept set is known. */
const READING_ORDER = { core: 0, domain: 1, project: 2, workspace: 3 }

/**
 * Decide the wrapper language: explicit config, else the language of the
 * corpus itself.
 * @param resolved - validated config.
 * @param layers - applicable layers.
 * @returns 'zh' or 'en'.
 */
function languageOf(resolved, layers) {
  if (resolved.language === 'zh' || resolved.language === 'en') return resolved.language
  const sample = layers.map(layer => layer.text).join('\n')
  return /[\u3400-\u9fff]/.test(sample) ? 'zh' : 'en'
}

/**
 * One layer's rendered block.
 * @param texts - wrapper vocabulary.
 * @param layer - the layer to render.
 * @returns Markdown block.
 */
function renderLayer(texts, layer) {
  const label = texts.priority[layer.layer]
  const heading = layer.title === undefined ? layer.id : `${layer.title} (${layer.id})`
  const source = layer.file.replace(os.homedir(), '~')
  const matched = layer.matchedOn.length > 0 ? ` — ${texts.matched}: ${layer.matchedOn.join(', ')}` : ''
  return `### ${label} · ${heading}${matched}\n_source: ${source}_\n\n${layer.text}\n`
}

/**
 * Render the whole constitution for one working directory, under the budget.
 * @param resolved - validated config.
 * @param cwd - session working directory.
 * @returns the prompt section text, or '' when no layer applies.
 */
function compose(resolved, cwd) {
  const layers = collectLayers(resolved, cwd)
  if (layers.length === 0) return ''
  const texts = TEXT[languageOf(resolved, layers)]
  const intro = [
    texts.heading,
    '',
    texts.lead,
    '',
    ...texts.rules.map(rule => `- ${rule}`),
    '',
  ].join('\n')

  let budget = resolved.maxChars - intro.length
  const keep = new Set()
  const dropped = []
  for (const layer of [...layers].sort((left, right) => PRIORITY[left.layer] - PRIORITY[right.layer])) {
    const block = renderLayer(texts, layer)
    if (block.length <= budget) {
      keep.add(layer)
      budget -= block.length
    } else {
      dropped.push(layer)
    }
  }

  const kept = layers.filter(layer => keep.has(layer)).sort(
    (left, right) => READING_ORDER[left.layer] - READING_ORDER[right.layer],
  )

  const tail = dropped.length === 0
    ? ''
    : `\n${texts.truncated}\n${dropped.map(layer => `- ${texts.priority[layer.layer]} · ${layer.id} (${layer.file.replace(os.homedir(), '~')})`).join('\n')}\n`

  if (kept.length === 0 && resolved.maxChars > 0) {
    // Nothing fit: guarantee the highest-priority layer, truncated to the room
    // that remains after the wrapper and the omission notice.
    const first = [...layers].sort((left, right) => PRIORITY[left.layer] - PRIORITY[right.layer])[0]
    const room = Math.max(0, resolved.maxChars - intro.length - 1)
    const head = first.text.slice(0, room)
    const block = renderLayer(texts, {
      ...first,
      text: head.length < first.text.length ? `${head}\n… ( truncated — read with constitution_read )` : head,
    })
    const others = layers.filter(layer => layer !== first)
    const omitted = others.length === 0
      ? ''
      : `\n${texts.truncated}\n${others.map(layer => `- ${texts.priority[layer.layer]} · ${layer.id} (${layer.file.replace(os.homedir(), '~')})`).join('\n')}\n`
    return `${intro}\n${block}${omitted}`
  }

  return `${intro}\n${kept.map(layer => renderLayer(texts, layer)).join('\n')}${tail}`
}

/**
 * Create the root directory and the seed corpus when they are missing.
 * Never throws: a read-only home directory must not disable the plugin.
 * @param resolved - validated config.
 */
function seedRoot(resolved) {
  try {
    if (fs.existsSync(resolved.root)) return
    fs.mkdirSync(path.join(resolved.root, DOMAIN_DIR), { recursive: true })
    fs.mkdirSync(path.join(resolved.root, PROJECT_DIR), { recursive: true })
    fs.writeFileSync(path.join(resolved.root, 'constitution.md'), seedText(resolved), 'utf8')
  } catch {
    // Seeding is best-effort; the tools create whatever they need on demand.
  }
}

/**
 * Append one rule to a layer document, creating it (with front matter) when needed.
 * @param file - absolute path of the layer document.
 * @param rule - the single rule line.
 * @param header - lines written when the document does not exist yet.
 * @returns whether the rule was already present.
 */
function appendRule(file, rule, header) {
  const existing = readTextFile(file, Number.MAX_SAFE_INTEGER) ?? `${header.join('\n')}\n`
  if (existing.split(/\r?\n/).some(line => line.trim() === `- ${rule}`)) return true
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(file, `${existing}${separator}- ${rule}\n`, 'utf8')
  return false
}

/**
 * A text-only tool result.
 * @param text - model-facing body.
 * @returns content blocks.
 */
function textBlocks(text) {
  return [{ type: 'text', text }]
}

/**
 * Install the constitution section and its tools.
 * @param ctx - plugin context.
 * @param config - row config.
 * @returns nothing; every registration is an effect owned by `ctx`.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config)
  if (resolved.seed) seedRoot(resolved)

  /** Per-working-directory rendered text, refreshed on a short interval. */
  const cache = new Map()

  const workingDirectory = () => {
    try {
      return ctx.get('workingDirectory')
    } catch {
      return undefined
    }
  }

  /**
   * @param agent - the agent whose step is being assembled, when known.
   * @returns the session's working directory, falling back to the process's.
   */
  const cwdOf = (agent) => {
    try {
      const session = agent?.session
      const service = workingDirectory()
      if (service !== undefined && session !== undefined) {
        const directory = service.get(session)
        if (typeof directory === 'string' && directory !== '') return directory
      }
    } catch {
      // Fall through to the process directory.
    }
    return process.cwd()
  }

  /**
   * @param cwd - working directory.
   * @returns the rendered section text.
   */
  const textFor = (cwd) => {
    const now = Date.now()
    const hit = cache.get(cwd)
    if (hit !== undefined && now - hit.at < resolved.refreshMs) return hit.text
    const text = compose(resolved, cwd)
    if (cache.size > 64) cache.clear()
    cache.set(cwd, { at: now, text })
    return text
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION,
    order: resolved.order,
    // The corpus is user text: braces must never be read as prompt variables.
    interpolate: false,
    text: (context) => {
      try {
        const text = textFor(cwdOf(context?.agent))
        return text
      } catch {
        return ''
      }
    },
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'constitution_read',
    description: 'Read the project constitution that was injected into this session: the exact text of the global, '
      + 'domain, project, and workspace layers that apply here, with the file each came from. Use it when the injected '
      + 'summary was trimmed, when you need to quote a rule verbatim, or to explain which long-term constraint is in force.',
    parameters: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['all', 'core', 'domain', 'project', 'workspace'],
          description: 'Only this layer. Defaults to all.',
        },
        name: {
          type: 'string',
          description: 'Only a layer whose id or title contains this text (case-insensitive).',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Constitution directory.' },
          cwd: { type: 'string', description: 'Working directory the layers were resolved for.' },
          layers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                layer: { type: 'string' },
                id: { type: 'string' },
                file: { type: 'string' },
                matchedOn: { type: 'array', items: { type: 'string' } },
                chars: { type: 'integer' },
                text: { type: 'string' },
              },
              required: ['layer', 'id', 'file', 'text'],
            },
          },
        },
        required: ['layers'],
      },
      render: (_args, value) => {
        const layers = Array.isArray(value?.layers) ? value.layers : []
        if (layers.length === 0) {
          return textBlocks(`No constitution layer applies to ${value?.cwd ?? process.cwd()}.\n`
            + `Read/write the corpus under ${resolved.root} or add a rule with constitution_learn.`)
        }
        const body = layers.map(layer => [
          `## ${layer.layer} · ${layer.id}  (${layer.chars} chars)`,
          `source: ${layer.file}`,
          layer.matchedOn.length > 0 ? `matched: ${layer.matchedOn.join(', ')}` : undefined,
          '',
          layer.text,
        ].filter(line => line !== undefined).join('\n')).join('\n\n---\n\n')
        return textBlocks(body)
      },
    },
    execute: async (args, exec) => {
      const input = args !== null && typeof args === 'object' ? args : {}
      const layer = typeof input.layer === 'string' ? input.layer : 'all'
      if (!['all', 'core', 'domain', 'project', 'workspace'].includes(layer)) {
        throw new Error(`constitution_read: \`layer\` must be one of all, core, domain, project, workspace (got "${String(input.layer)}")`)
      }
      const needle = typeof input.name === 'string' ? input.name.toLowerCase() : undefined
      const cwd = cwdOf(exec?.agent)
      let layers = collectLayers(resolved, cwd)
      if (layer !== 'all') layers = layers.filter(entry => entry.layer === layer)
      if (needle !== undefined && needle !== '') {
        layers = layers.filter(entry => entry.id.toLowerCase().includes(needle)
          || (entry.title ?? '').toLowerCase().includes(needle))
      }
      return {
        root: resolved.root,
        cwd,
        layers: layers.map(entry => ({
          layer: entry.layer,
          id: entry.id,
          file: entry.file,
          matchedOn: entry.matchedOn,
          chars: entry.text.length,
          text: entry.text,
        })),
      }
    },
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'constitution_learn',
    description: 'Persist a long-term engineering constraint into the project constitution so every FUTURE session '
      + 'inherits it without being told again. Use it when the user states a durable rule, standard, or physical '
      + 'constraint (an acceptance tolerance, a naming scheme, a structural convention) rather than a one-off request. '
      + 'Layers: core = all sessions; domain = projects matching the given tokens; project = this working directory only. '
      + 'Prefer the narrowest layer that is still true. The rule applies from the next model step in this session too.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'One self-contained rule, imperative, verifiable.' },
        layer: { type: 'string', enum: ['core', 'domain', 'project'], description: 'Scope to persist into.' },
        name: {
          type: 'string',
          description: 'Layer id for `domain` (for example "cad"). Defaults to "domain". Ignored for other layers.',
        },
        match: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lowercase match tokens for a `domain` pack (path segments, file extensions, keywords). '
            + 'Defaults to the tokens in `name`.',
        },
      },
      required: ['text', 'layer'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          layer: { type: 'string' },
          duplicate: { type: 'boolean' },
          scope: { type: 'string' },
        },
        required: ['file', 'layer'],
      },
      render: (_args, value) => textBlocks(
        value?.duplicate === true
          ? `Already recorded in the ${value.layer} layer: ${value.file}`
          : `Recorded in the ${value.layer} layer (${value.scope}).\n${value.file}\n\n`
            + 'It is inherited automatically by every later session that matches this scope.',
      ),
    },
    execute: async (args, exec) => {
      const input = args !== null && typeof args === 'object' ? args : {}
      const rule = typeof input.text === 'string' ? input.text.trim() : ''
      if (rule === '') throw new Error('constitution_learn: `text` must be a non-empty rule')
      if (/[\r\n]/.test(rule)) throw new Error('constitution_learn: `text` must be one line; call the tool once per rule')
      const layer = input.layer
      const cwd = cwdOf(exec?.agent)

      if (layer === 'core') {
        const file = path.join(resolved.root, 'constitution.md')
        const duplicate = appendRule(file, rule, ['# 工程憲法 · Global constitution', '', '## 長期約束'])
        return { file, layer, duplicate, scope: 'every session' }
      }
      if (layer === 'domain') {
        const rawName = typeof input.name === 'string' && input.name.trim() !== '' ? input.name.trim() : 'domain'
        const id = stableId(rawName)
        const tokens = Array.isArray(input.match)
          ? input.match.map(token => String(token).trim().toLowerCase()).filter(token => token !== '')
          : (id === 'domain' ? [] : [id])
        const file = path.join(resolved.root, DOMAIN_DIR, `${id}.md`)
        const duplicate = appendRule(file, rule, [
          '---',
          `match: ${tokens.join(', ')}`,
          `title: ${rawName}`,
          '---',
          '',
          `# ${rawName} · domain constitution`,
          '',
          '## 長期約束',
        ])
        return {
          file,
          layer,
          duplicate,
          scope: tokens.length === 0 ? 'no match tokens: this pack never applies until you add `match`' : `projects matching ${tokens.join(', ')}`,
        }
      }
      if (layer === 'project') {
        const projectName = path.basename(cwd) || cwd
        const id = stableId(typeof input.name === 'string' && input.name.trim() !== '' ? input.name.trim() : projectName)
        const file = path.join(resolved.root, PROJECT_DIR, `${id}.md`)
        const duplicate = appendRule(file, rule, [
          '---',
          `match: ${id}, ${projectName.toLowerCase()}`,
          '---',
          '',
          `# ${projectName} · project constitution`,
          '',
          '## 長期約束',
        ])
        return { file, layer, duplicate, scope: `working directory ${cwd}` }
      }
      throw new Error(`constitution_learn: \`layer\` must be core, domain, or project (got "${String(layer)}")`)
    },
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'constitution_status',
    description: 'Report how the constitution resolves for this session: directory, which layers matched, their sizes, '
      + 'the injected character budget, and whether anything was omitted. Use it to debug why a rule did or did not apply.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          cwd: { type: 'string' },
          section: { type: 'string' },
          order: { type: 'number' },
          budget: { type: 'number' },
          injectedChars: { type: 'integer' },
          layers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                layer: { type: 'string' },
                id: { type: 'string' },
                file: { type: 'string' },
                chars: { type: 'integer' },
              },
              required: ['layer', 'id', 'file'],
            },
          },
        },
        required: ['root', 'cwd', 'layers'],
      },
      render: (_args, value) => {
        const rows = value.layers.map(entry => `- ${entry.layer} · ${entry.id} — ${entry.chars ?? 0} chars — ${entry.file}`)
        return textBlocks([
          `Constitution root: ${value.root}`,
          `Working directory: ${value.cwd}`,
          `Prompt section: ${value.section} (order ${value.order}), budget ${value.budget} chars`,
          `Injected now: ${value.injectedChars} chars`,
          '',
          ...(rows.length === 0 ? ['No layer applies here.'] : rows),
        ].join('\n'))
      },
    },
    execute: async (_args, exec) => {
      const cwd = cwdOf(exec?.agent)
      const layers = collectLayers(resolved, cwd)
      return {
        root: resolved.root,
        cwd,
        section: SECTION,
        order: resolved.order,
        budget: resolved.maxChars,
        injectedChars: textFor(cwd).length,
        layers: layers.map(entry => ({ layer: entry.layer, id: entry.id, file: entry.file, chars: entry.text.length })),
      }
    },
  }))
}
