/* 无头 Chromium CDP 冒烟测试：记账时间精确到秒（时间滚轮 + 明细展示）
 * 运行：node scripts/test_ui_time.mjs  （需先 npm run preview）
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { randomInt } from 'node:crypto'

const URL = 'http://localhost:4173/'
const PORT = 9300 + randomInt(0, 99)
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

  // 注入干净数据（含一笔带 time 的今日数据，验证明细展示回推）
  await evalIn(`(() => {
    const d = new Date();
    const date = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const acc = [{id:'a',groupId:'financial',name:'现金'}];
    const rec = [
      {id:'t1',type:'expense',amount:100,categoryId:'food',accountId:'a',note:'午饭',date:date,time:'08:30:15',createdAt:1},
      {id:'t2',type:'income',amount:300,categoryId:'salary',accountId:'a',note:'工资',date:date,time:'19:05:42',createdAt:2}
    ];
    localStorage.setItem('xwj_accounts_v1', JSON.stringify(acc));
    localStorage.setItem('xwj_records_v1', JSON.stringify(rec));
    localStorage.removeItem('xwj_templates_v1');
    location.reload();
    return true
  })()`)
  await sleep(2400)

  ok('明细页展示记账时间（08:30:15）', await evalIn(`document.body.innerText.includes('08:30:15')`))

  // 打开记账页（点击右下角 + 按钮）
  const opened = await evalIn(`(() => {
    const fab = document.querySelector('.tab.fab');
    if (!fab) return false;
    fab.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(900)
  ok('打开记账页', opened && await evalIn(`!!document.querySelector('.sheet')`))

  // 时间按钮存在并显示 HH:MM:SS
  await sleep(300)
  ok('记账页含时间按钮且显示到秒', await evalIn(`(() => {
    const b = document.querySelector('.time-btn');
    if (!b) return false;
    const t = b.textContent.replace(/[^0-9:]/g,'');
    return /[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(t);
  })()`))

  // 打开时间滚轮
  const openedTime = await evalIn(`(() => {
    const b = document.querySelector('.time-btn');
    if (!b) return false;
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(500)
  ok('打开时间滚轮弹层', openedTime && await evalIn(`!!document.querySelector('.time-picker')`))
  ok('时间滚轮含时/分/秒三列', await evalIn(`document.querySelectorAll('.time-picker .tcol').length === 3`))

  // 选择 14:25:36 并确认
  await evalIn(`(() => {
    const cols = document.querySelectorAll('.time-picker .tcol');
    const set = (col, val) => {
      const btns = [...col.querySelectorAll('.tnum')];
      const idx = btns.findIndex(b => b.textContent.trim() === val);
      if (idx >= 0) { btns[idx].dispatchEvent(new MouseEvent('click',{bubbles:true})); }
    };
    set(cols[0], '14'); set(cols[1], '25'); set(cols[2], '36');
    return true
  })()`)
  await sleep(300)
  await evalIn(`(() => {
    const ok = [...document.querySelectorAll('.time-picker .pk-btn.ok')][0];
    ok && ok.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(400)
  ok('确认后时间按钮更新为 14:25:36', await evalIn(`document.querySelector('.time-btn').textContent.replace(/[^0-9:]/g,'').includes('14:25:36')`))

  // 输入金额并保存
  await evalIn(`(() => {
    // 先确保选了分类（默认第一项）与账户；直接通过 store 设置金额后保存
    const ev = window.__xwj_dev; // 不存在则走 UI
    return true
  })()`)
  // 通过键盘输入金额 12.5 并点完成
  await evalIn(`(() => {
    const ks = [...document.querySelectorAll('.num-pad .key')];
    const map = {'7':7,'8':8,'9':9,'4':4,'5':5,'6':6,'1':1,'2':2,'3':3,'0':0};
    const press = (k) => { const b = ks.find(x=>x.textContent.trim()===String(k)); b && b.dispatchEvent(new MouseEvent('click',{bubbles:true})); };
    press(1); press(2); press('.'); press(5);
    return true
  })()`)
  await sleep(200)
  await evalIn(`(() => {
    const done = [...document.querySelectorAll('.fn.ok')].find(b=>b.textContent.trim()==='完成');
    done && done.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true
  })()`)
  await sleep(600)

  // 验证本地存储中刚保存的记录带 time
  const savedTime = await evalIn(`(() => {
    const recs = JSON.parse(localStorage.getItem('xwj_records_v1') || '[]');
    const r = recs.find(x => Math.abs(x.amount - 12.5) < 0.001);
    return r ? r.time : '';
  })()`)
  ok('保存的记录含 time（HH:MM:SS）', /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(savedTime || ''))

  ok('无运行时错误', errors.length === 0)
  if (errors.length) console.log('  控制台错误：', errors.slice(0, 5))
} catch (e) {
  console.log('测试异常：', e.message)
  process.exitCode = 1
}

console.log(`\nUI 时间冒烟：${results.filter(r=>r[1]).length}/${results.length} 通过`)
chrome.kill('SIGKILL')
clearTimeout(HARD)
process.exit(process.exitCode || 0)
