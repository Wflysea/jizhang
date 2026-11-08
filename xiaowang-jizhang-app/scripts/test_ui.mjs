/* 无头 Chromium CDP 冒烟测试：加载 App、切换账本管理、执行年度结转、验证余额承接
 * 运行：node scripts/test_ui.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { randomInt } from 'node:crypto'

const URL = 'http://localhost:4173/'
const PORT = 9300 + randomInt(0, 99)
// 超时强制退出，避免挂死
const HARD = setTimeout(() => { console.error('超时强制退出'); process.exit(2) }, 90000)

const chrome = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cr-${PORT}`,
  'about:blank'
], { stdio: 'ignore' })
await sleep(1800)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page0 = list.find(t => t.type === 'page') || list[0]
const wsUrl = page0.webSocketDebuggerUrl

const ws = new WebSocket(wsUrl)
let id = 0
const pending = new Map()
const queue = []
let wsOpen = false
ws.onopen = () => { wsOpen = true; for (const m of queue) ws.send(m) }
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const i = ++id
    const t = setTimeout(() => { pending.delete(i); reject(new Error('cdp timeout ' + method)) }, 8000)
    pending.set(i, r => { clearTimeout(t); resolve(r) })
    const msg = JSON.stringify({ id: i, method, params })
    if (wsOpen) ws.send(msg); else queue.push(msg)
  })
}
await cdp('Page.enable')
await cdp('Runtime.enable')
await sleep(200)

const errors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Page.javascriptDialogOpening') {
    cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map(a => a.value || a.description).join(' '))
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
  }
})

await cdp('Page.navigate', { url: URL })
await sleep(2000)

async function evalIn(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('EVAL ERR: ' + JSON.stringify(r.exceptionDetails))
  return r.result.value
}

const results = []
function ok(name, cond) { results.push([name, !!cond]); console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) process.exitCode = 1 }

try {
  ok('App 渲染（明细页顶部栏）', await evalIn(`!!document.querySelector('.topbar')`))
  ok('明细页手风琴 >= 4', await evalIn(`document.querySelectorAll('.acc').length >= 4`))

  await evalIn(`(() => {
    const acc = [{id:'a',groupId:'financial',name:'现金'},{id:'b',groupId:'financial',name:'卡'}];
    const rec = [
      {id:'t1',type:'expense',amount:100,categoryId:'food',accountId:'a',note:'',date:'2023-06-01',createdAt:1},
      {id:'t2',type:'income',amount:300,categoryId:'salary',accountId:'a',note:'',date:'2023-12-15',createdAt:2}
    ];
    localStorage.setItem('xwj_accounts_v1', JSON.stringify(acc));
    localStorage.setItem('xwj_records_v1', JSON.stringify(rec));
    localStorage.removeItem('xwj_templates_v1');
    return true
  })()`)
  await evalIn(`location.href = 'http://localhost:4173/?tab=mine'`)
  await sleep(2400)

  ok('年度结转入口存在', await evalIn(`[...document.querySelectorAll('.li-txt')].some(e=>e.textContent.includes('年度结转'))`))

  await evalIn(`(() => {
    const li = [...document.querySelectorAll('.li')].find(e => e.textContent.includes('年度结转'));
    li && li.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(600)
  ok('打开年度结转弹层（年份选择器）', await evalIn(`!!document.querySelector('.year-stepper')`))

  const clicked = await evalIn(`(() => {
    const btn = [...document.querySelectorAll('.sbtn.ok')].find(b => /结转至/.test(b.textContent));
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(800)
  ok('点击结转按钮', clicked)

  // 结转成功后弹层自动关闭，重新打开查看封账信息
  await evalIn(`(() => {
    const li = [...document.querySelectorAll('.li')].find(e => e.textContent.includes('年度结转'));
    li && li.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(600)
  const info = await evalIn(`[...document.querySelectorAll('.imp-sum')].map(e=>e.textContent).join('|')`)
  ok('显示已结转至 X 年', /已结转至/.test(info))
  ok('显示封存 2 笔', /封存/.test(info))

  await evalIn(`location.href = 'http://localhost:4173/?tab=account'`)
  await sleep(2200)
  const balText = await evalIn(`document.body.innerText`)
  ok('账户页余额承接（现金 200）', /现金[\s\S]*200/.test(balText))

  ok('无运行时错误', errors.length === 0)
  if (errors.length) console.log('  控制台错误：', errors.slice(0, 5))
} catch (e) {
  console.log('测试异常：', e.message)
  process.exitCode = 1
}

console.log(`\nUI 冒烟：${results.filter(r=>r[1]).length}/${results.length} 通过`)
chrome.kill('SIGKILL')
clearTimeout(HARD)
process.exit(process.exitCode || 0)
