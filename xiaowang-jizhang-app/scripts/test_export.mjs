/* 浏览器内集成测试：真实 dataIO 导出（含图片 ZIP）↔ 导入 往返
 * 通过 Vite dev server 动态加载 src 模块，调用真实的 exportBackup / parseImportFile。
 * 运行：node scripts/test_export.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { randomInt } from 'node:crypto'

const PORT = 9400 + randomInt(0, 99)
const HARD = setTimeout(() => { console.error('超时强制退出'); process.exit(2) }, 90000)

const chrome = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cr-${PORT}`,
  'about:blank'
], { stdio: 'ignore' })
await sleep(1800)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const wsUrl = (list.find(t => t.type === 'page') || list[0]).webSocketDebuggerUrl
const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map(), queue = []
let wsOpen = false
ws.onopen = () => { wsOpen = true; for (const m of queue) ws.send(m) }
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) } }
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id
    const t = setTimeout(() => { pending.delete(i); reject(new Error('cdp timeout ' + method)) }, 8000)
    pending.set(i, r => { clearTimeout(t); resolve(r) })
    const msg = JSON.stringify({ id: i, method, params })
    if (wsOpen) ws.send(msg); else queue.push(msg)
  })
}
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
})
await cdp('Page.enable'); await cdp('Runtime.enable')

// 自动探测 Vite dev server 端口（优先 5173，被占用时回退到 5174）
let DEV_URL = null
for (const port of [5173, 5174, 5175, 5176]) {
  try {
    const probe = await fetch(`http://localhost:${port}/`, { method: 'GET' })
    if (probe.ok) { DEV_URL = `http://localhost:${port}/`; break }
  } catch (_) { /* 端口未监听，继续 */ }
}
if (!DEV_URL) throw new Error('未找到 Vite dev server，请先启动 npm run dev')
console.log('  使用 dev server：', DEV_URL)
await cdp('Page.navigate', { url: DEV_URL })
await sleep(2500)

async function evalIn(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails))
  return r.result.value
}

const results = []
function ok(name, cond) { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) process.exitCode = 1 }

try {
  // 在页面内动态加载真实模块（与已加载的 App 共享同一实例），并执行导出↔导入往返
  const ret = await evalIn(`(async () => {
    const ledgerMod = await import('/src/store/ledger.js')
    const dataIOMod = await import('/src/utils/dataIO.js')
    const getCat = (await import('/src/data/categories.js'))
    const { state, accountName, transferText } = ledgerMod

    state.accounts = [{id:'a',groupId:'financial',name:'现金'},{id:'b',groupId:'financial',name:'卡'}]
    // 一张小图（1x1 PNG 的 dataURL）
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    state.records = [
      {id:'r1',type:'expense',amount:88.5,categoryId:'food',accountId:'a',note:'午饭',date:'2024-05-01',createdAt:1,images:[png]},
      {id:'r2',type:'income',amount:200,categoryId:'salary',accountId:'a',note:'工资',date:'2024-05-02',createdAt:2}
    ]
    state.templates = []
    state.budgets = [
      { id: 'bg1', categoryId: null, amount: 1000, createdAt: 1 },
      { id: 'bg2', categoryId: 'food', amount: 300, createdAt: 1 }
    ]

    const detailRow = (r) => ({
      '日期': r.date,
      '类型': r.type==='transfer'?'转账':(r.type==='income'?'收入':'支出'),
      '分类': r.type==='transfer'?'转账':(getCat.getCategory(r.type,r.categoryId).name),
      '金额': r.amount, '账户': transferText(r), '备注': r.note||''
    })
    const byCategory = () => []
    const byMonth = () => []

    // 拦截下载，捕获导出的 Blob（含 ZIP 二进制）
    let captured = null
    const orig = URL.createObjectURL
    URL.createObjectURL = (blob) => { captured = blob; return 'blob:captured' }

    const r = dataIOMod.exportBackup(ledgerMod.accountBalances.value, { detailRow, byCategory, byMonth })
    const fileResult = await r.file
    const bytes = captured ? new Uint8Array(await captured.arrayBuffer()) : null
    URL.createObjectURL = orig

    // 用导出的 ZIP 还原成 File，再导入
    let importResult = null, restoredImages = null, parsedBudgetsDump = null
    if (bytes) {
      const file = new File([bytes], 'x.zip', { type: 'application/zip' })
      const parsed = await dataIOMod.parseImportFile(file)
      parsedBudgetsDump = parsed.budgets.map(b => ({ c: b.categoryId, a: b.amount }))
      importResult = { records: parsed.records.length, imageCount: parsed.imageCount, hasImages: !!parsed.images, budgets: parsed.budgets.length }
      // 覆盖导入，验证图片回写
      dataIOMod.applyImport(parsed, 'replace')
      const recWithImg = state.records.find(x => x.id === 'r1')
      restoredImages = recWithImg ? (recWithImg.images ? recWithImg.images.length : 0) : -1
    }

    // 预算：导出→导入后是否完整还原
    const budgetsAfter = state.budgets.length
    const hasTotalBg = !!state.budgets.find(b => b.categoryId === null && Math.abs(b.amount - 1000) < 0.001)
    const hasFoodBg = !!state.budgets.find(b => b.categoryId === 'food' && Math.abs(b.amount - 300) < 0.001)
    const budgetsParsed = importResult ? importResult.budgets : 0

    return JSON.stringify({
      zipped: r.zipped, images: r.images, name: r.name,
      zipBytes: bytes ? bytes.length : 0,
      importResult, restoredImages, budgetsParsed, budgetsAfter, hasTotalBg, hasFoodBg,
      bgDump: state.budgets.map(b => ({ c: b.categoryId, a: b.amount })),
      pBg: parsedBudgetsDump,
      balA: ledgerMod.accountBalanceOf('a')
    })
  })()`)
  const data = JSON.parse(ret)
  console.log('  导出/导入结果：', JSON.stringify(data))

  ok('导出为 ZIP（zipped=true）', data.zipped === true)
  ok('导出包含 1 张图片', data.images === 1)
  ok('ZIP 字节数 > 0', data.zipBytes > 0)
  ok('导入解析到 2 笔流水', data.importResult && data.importResult.records === 2)
  ok('导入识别到图片', data.importResult && data.importResult.imageCount === 1)
  ok('图片成功回写到记录（1 张）', data.restoredImages === 1)
  ok('导入后余额承接正确（200-88.5=111.5）', Math.abs(data.balA - 111.5) < 0.001)
  ok('导出解析到 2 条预算', data.budgetsParsed === 2)
  ok('导入后还原 2 条预算', data.budgetsAfter === 2)
  ok('总预算金额还原正确', data.hasTotalBg === true)
  ok('分类预算金额还原正确', data.hasFoodBg === true)
} catch (e) {
  console.log('测试异常：', e.message)
  process.exitCode = 1
}

console.log(`\n导出/导入集成：${results.filter(r=>r[1]).length}/${results.length} 通过`)
chrome.kill('SIGKILL')
clearTimeout(HARD)
process.exit(process.exitCode || 0)
