import { apply } from '../index.js'
import os from 'node:os'
import path from 'node:path'

const root = path.join(os.tmpdir(), 'dsh-constitution-smoke')
const cwd = process.cwd()

const sections = []
const tools = new Map()

const ctx = {
  effect(fn) { const d = fn(); return d },
  systemPrompt: {
    section(definition) { sections.push(definition); return () => {} },
    getSectionOrder() { return 0 },
  },
  tools: { register(definition) { tools.set(definition.name, definition); return () => {} } },
  get(name) {
    if (name === 'workingDirectory') return { get: () => cwd }
    return undefined
  },
}

apply(ctx, { root, language: 'zh' })
const agent = { session: { id: 'session-1' } }

const section = sections[0]
const text = section.text({ agent })
console.log('--- section name/order:', section.name, section.order, 'interpolate:', section.interpolate)
console.log('--- section text ---')
console.log(text)
console.log('--- chars:', text.length)

for (const name of ['constitution_status', 'constitution_read', 'constitution_learn']) {
  const tool = tools.get(name)
  console.log(`\n=== ${name} ===`)
  if (name === 'constitution_learn') continue
  const value = await tool.execute(name === 'constitution_read' ? { layer: 'all' } : {}, { agent })
  console.log(JSON.stringify(value).slice(0, 600))
  console.log('render ->', JSON.stringify(tool.output.render({}, value)).slice(0, 300))
}

const learn = tools.get('constitution_learn')
const value = await learn.execute({ text: '关键尺寸按 ±5mm 验收', layer: 'project' }, { agent })
console.log('\n=== learn ===', JSON.stringify(value))
console.log(learn.output.render({}, value)[0].text)

const after = tools.get('constitution_read').execute({ layer: 'project' }, { agent })
console.log('\nproject layer after learn:', JSON.stringify((await after).layers))
