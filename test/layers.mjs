import { apply } from '../index.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.join(os.tmpdir(), 'dsh-constitution-smoke2')
const project = path.join(os.tmpdir(), 'gear-box-cad')
fs.rmSync(root, { recursive: true, force: true })
fs.rmSync(project, { recursive: true, force: true })
fs.mkdirSync(path.join(root, 'domains'), { recursive: true })
fs.mkdirSync(path.join(root, 'projects'), { recursive: true })
fs.mkdirSync(project, { recursive: true })
fs.writeFileSync(path.join(project, 'housing.step'), '')
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'gear-box', keywords: ['cad'] }))

fs.writeFileSync(path.join(root, 'constitution.md'), '# global\n\n- 結論先行\n')
fs.writeFileSync(path.join(root, 'domains', 'cad.md'), '---\nmatch: .step, gear\ntitle: 機械結構\n---\n\n# cad\n\n- 公差默認 ±0.2mm\n')
fs.writeFileSync(path.join(root, 'domains', 'web.md'), '---\nmatch: next, react\n---\n\n# web\n\n- 組件不要超過 200 行\n')
fs.writeFileSync(path.join(root, 'projects', 'gear-box.md'), '---\nmatch: gear-box\n---\n\n# gear-box\n\n- 關鍵尺寸按 ±5mm 驗收\n')
fs.mkdirSync(path.join(project, '.dsh'))
fs.writeFileSync(path.join(project, '.dsh', 'constitution.md'), '# workspace\n\n- 提交信息用英文\n')

function build(config) {
  const sections = []
  const tools = new Map()
  const ctx = {
    effect(fn) { return fn() },
    systemPrompt: { section(definition) { sections.push(definition); return () => {} }, getSectionOrder() { return 0 } },
    tools: { register(definition) { tools.set(definition.name, definition); return () => {} } },
    get: name => (name === 'workingDirectory' ? { get: () => project } : undefined),
  }
  apply(ctx, { root, language: 'auto', ...config })
  return { sections, tools }
}

const wide = build({})
const text = wide.sections[0].text({ agent: { session: { id: 's' } } })
console.log('=== wide (' + text.length + ' chars) ===')
console.log(text)

const narrow = build({ maxChars: 420 })
const tight = narrow.sections[0].text({ agent: { session: { id: 's' } } })
console.log('\n=== tight budget (' + tight.length + ' chars) ===')
console.log(tight)
