import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const runnerDir = dirname(fileURLToPath(import.meta.url))
const root = join(runnerDir, '..')
const testHome = join(root, 'home')
const patch = join(root, 'patches', 'account.yml')

function parseArgs(argv) {
  const out = { scenario: '', prompt: '', name: '', quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--scenario') out.scenario = argv[++i] ?? ''
    else if (a === '--prompt') out.prompt = argv[++i] ?? ''
    else if (a === '--name') out.name = argv[++i] ?? ''
    else if (a === '--quiet') out.quiet = true
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
let scenarioPath = ''
let prompt = args.prompt
let name = args.name
let expect = {}

if (args.scenario) {
  const candidates = [
    join(root, args.scenario),
    join(root, `${args.scenario}.json`),
    join(root, 'scenarios', `${args.scenario}.json`),
  ]
  scenarioPath = candidates.find((p) => existsSync(p)) ?? ''
  if (!scenarioPath) {
    console.error(`找不到场景：${args.scenario}`)
    process.exit(1)
  }
  const sc = JSON.parse(readFileSync(scenarioPath, 'utf8'))
  if (!prompt) prompt = sc.prompt
  if (!name) name = sc.name
  expect = sc.expect ?? {}
}

if (!prompt) {
  console.error('需要 --scenario 或 --prompt')
  process.exit(1)
}
if (!name) name = 'run'
if (!existsSync(testHome)) {
  console.error('隔离 home 不存在，先跑 init.ps1')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const runDir = join(root, 'runs', `${name}-${stamp}`)
mkdirSync(runDir, { recursive: true })

const promptPath = join(runDir, 'prompt.txt')
const eventsPath = join(runDir, 'events.ndjson')
const stderrPath = join(runDir, 'stderr.log')
const livePath = join(runDir, 'live.log')
writeFileSync(promptPath, prompt, 'utf8')

function say(line) {
  // live.log 留一份完整过程，stdout 给终端
  appendFileSync(livePath, line + '\n', 'utf8')
  if (!args.quiet) console.log(line)
}

say(`场景：${name}`)
say(`prompt：${prompt}`)
if (Object.keys(expect).length) say(`expect：${JSON.stringify(expect)}`)
say('')

// ---- 实时 tail events.ndjson ----
let offset = 0
let pending = ''
const seen = new Set()

function truncate(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

function printEvent(e) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  switch (e.type) {
    case 'session':
      say(`[${t}] ▸ session ${e.sessionId}`)
      break
    case 'status':
      if (e.phase === 'turn_end') say(`[${t}] ■ turn_end ${e.reason?.kind ?? '?'}`)
      else if (e.phase === 'step_start') say(`[${t}] · step ${e.turn}.${e.step}`)
      break
    case 'tool_call':
      say(`[${t}] → ${e.tool} ${truncate(JSON.stringify(e.input))}`)
      break
    case 'tool_result':
      say(`[${t}] ← ${e.status} ${truncate(e.result)}`)
      break
    case 'text':
      if (e.text) say(`[${t}] 💬 ${truncate(e.text)}`)
      break
    case 'thinking':
      if (e.text) say(`[${t}] … ${truncate(e.text, 100)}`)
      break
    case 'error':
      say(`[${t}] ✖ ERROR ${truncate(e.message)}`)
      break
  }
}

function tail() {
  let data
  try {
    data = readFileSync(eventsPath, 'utf8')
  } catch {
    return
  }
  if (data.length <= offset) return
  pending += data.slice(offset)
  offset = data.length
  const lines = pending.split('\n')
  pending = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      const key = JSON.stringify(event)
      if (seen.has(key)) continue
      seen.add(key)
      printEvent(event)
    } catch {
      // 忽略半行
    }
  }
}

const timer = setInterval(tail, 120)

function finish() {
  clearInterval(timer)
  tail()
  if (pending.trim()) {
    try {
      printEvent(JSON.parse(pending))
    } catch {
      // 忽略
    }
  }
  const events = readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const final = events.find((e) => e.type === 'final')
  const errorEvents = events.filter((e) => e.type === 'error')
  const turnErrors = events.filter((e) => e.type === 'turn_end' && e.reason?.kind === 'error')
  const toolNames = events.filter((e) => e.type === 'tool_call').map((e) => e.tool)

  const checks = []
  const check = (n, ok, detail = '') => checks.push({ n, ok, detail })

  check('存在 final 事件', Boolean(final))
  check('turn 正常结束', final?.reason?.kind === 'completed', final?.reason?.kind ?? 'no-final')
  check('无 error 事件', errorEvents.length === 0, errorEvents.map((e) => e.message).join('; '))
  if (expect.noError) {
    check('无 turn 错误', turnErrors.length === 0, turnErrors.map((e) => e.reason?.error?.message).join('; '))
  }
  if (expect.finalTextContains) {
    const text = String(final?.text ?? '')
    check(`final 包含「${expect.finalTextContains}」`, text.includes(expect.finalTextContains), text.slice(0, 120))
  }
  if (Array.isArray(expect.tools)) {
    for (const tool of expect.tools) check(`调用了工具 ${tool}`, toolNames.includes(tool), toolNames.join(', '))
  }

  say('')
  let failed = 0
  for (const c of checks) {
    say(`${c.ok ? 'PASS' : 'FAIL'} ${c.n}${!c.ok && c.detail ? ` (${c.detail})` : ''}`)
    if (!c.ok) failed++
  }
  say(`\n${checks.length - failed}/${checks.length} 通过`)
  say(`run dir: ${runDir}`)
  process.exitCode = failed ? 1 : 0
}

const inp = openSync(promptPath, 'r')
const out = openSync(eventsPath, 'w')
const err = openSync(stderrPath, 'w')

// dsh.cmd 的实际入口：Electron 以 node 模式跑 cli.js
const DSH_EXE = process.env.DSH_EXE || 'D:\\DeepSeek Harness\\DeepSeek Harness.exe'
const DSH_CLI =
  process.env.DSH_CLI ||
  'D:\\DeepSeek Harness\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\cli.js'

const child = spawn(
  DSH_EXE,
  ['--expose-internals', DSH_CLI, '--patch', patch, '--profile', 'headless', '--json', '-'],
  {
    stdio: [inp, out, err],
    env: { ...process.env, DSH_HOME: testHome, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
  },
)

child.on('close', (code) => {
  closeSync(inp)
  closeSync(out)
  closeSync(err)
  say(`\ndsh exit: ${code}`)
  finish()
})

child.on('error', (error) => {
  clearInterval(timer)
  closeSync(inp)
  closeSync(out)
  closeSync(err)
  say(`spawn 失败：${error.message}`)
  process.exit(1)
})
