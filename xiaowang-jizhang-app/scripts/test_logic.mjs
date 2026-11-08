/* 逻辑单测：年度结转 + ZIP 打包/解包 + 导入导出图片往返
 * 运行：node scripts/test_logic.mjs
 */
import assert from 'node:assert'
import { strict as _assert } from 'node:assert'

// ---- 浏览器全局 polyfill ----
const _store = new Map()
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k)
}
globalThis.Blob = class { constructor(parts) { this.size = parts.reduce((s, p) => s + (typeof p === 'string' ? p.length : p.byteLength || p.length || 0), 0) } }

let pass = 0
function ok(name, cond) {
  if (!cond) throw new Error('FAIL: ' + name)
  pass++; console.log('  ✓ ' + name)
}

// ---- ZIP 往返 ----
const { zipStore, unzip, isZip, bytesToBase64, base64ToBytes, dataUrlToBytes, bytesToDataUrl, extOfMime } = await import('../src/utils/zip.js')
console.log('ZIP 往返：')
{
  const f1 = new Uint8Array([1, 2, 3, 4, 5])
  const f2 = new Uint8Array([255, 0, 128, 64])
  const f3 = new TextEncoder().encode('你好，记账📌')
  const zip = zipStore([{ name: 'data.xlsx', bytes: f1 }, { name: 'images/a_0.jpg', bytes: f2 }, { name: 'images/b_1.png', bytes: f3 }])
  ok('生成 ZIP 以 PK 开头', isZip(zip))
  const out = unzip(zip)
  ok('解包得到 3 个文件', Object.keys(out).length === 3)
  ok('data.xlsx 内容一致', Buffer.compare(Buffer.from(out['data.xlsx']), Buffer.from(f1)) === 0)
  ok('images/a_0.jpg 内容一致', Buffer.compare(Buffer.from(out['images/a_0.jpg']), Buffer.from(f2)) === 0)
  ok('images/b_1.png 内容一致', Buffer.compare(Buffer.from(out['images/b_1.png']), Buffer.from(f3)) === 0)
  // base64 往返
  const b64 = bytesToBase64(f3)
  ok('bytes↔base64 往返一致', Buffer.compare(Buffer.from(base64ToBytes(b64)), Buffer.from(f3)) === 0)
  // dataURL 往返
  const du = bytesToDataUrl('image/jpeg', f2)
  const p = dataUrlToBytes(du)
  ok('dataURL 解析 mime 正确', p.mime === 'image/jpeg')
  ok('dataURL 内容一致', Buffer.compare(Buffer.from(p.bytes), Buffer.from(f2)) === 0)
  ok('extOfMime(jpeg)', extOfMime('image/jpeg') === 'jpg')
  ok('extOfMime(png)', extOfMime('image/png') === 'png')
}

// ---- 年度结转 ----
const ledger = await import('../src/store/ledger.js')
const { state, accountBalanceOf, carryOver, undoCarryOver, carryOverYear, carryOverInfo, addRecord, accountBalances } = ledger
console.log('年度结转：')
{
  // 重置
  state.records = []
  state.accounts = [{ id: 'a', groupId: 'financial', name: '现金' }, { id: 'b', groupId: 'financial', name: '银行卡' }]

  // 2023 年两笔流水：支出 100、收入 300 → 账户 a 余额 200
  addRecord({ type: 'expense', amount: 100, categoryId: 'food', accountId: 'a', note: '', date: '2023-06-01' })
  addRecord({ type: 'income', amount: 300, categoryId: 'salary', accountId: 'a', note: '', date: '2023-12-15' })
  // 账户 b 余额 0
  ok('结转前 a 余额=200', accountBalanceOf('a') === 200)
  ok('结转前 b 余额=0', accountBalanceOf('b') === 0)

  const res = carryOver(2025)
  ok('carryOver 成功', res.ok === true && res.year === 2025)
  ok('封账年份=2025', carryOverYear() === 2025)
  ok('结转后 a 余额仍为 200（期初余额承接）', accountBalanceOf('a') === 200)
  ok('结转后 b 未生成期初（余额0）', accountBalances.value.find(x => x.id === 'b').balance === 0)
  // 往年流水已封存：2 笔 2023 流水被封存
  ok('封存笔数=2', carryOverInfo().closedCount === 2)
  // 期初余额记录在 2025-01-01 可见
  const opens = state.records.filter(r => r.carryover)
  ok('仅 1 条期初余额', opens.length === 1 && opens[0].carryover === true)
  ok('期初余额金额=200', opens[0].amount === 200 && opens[0].type === 'income')
  // 2023 真实流水仍在（保留），只是被封存
  ok('原始 2 笔流水仍保留', state.records.filter(r => r.date.startsWith('2023') && !r.carryover).length === 2)

  // 2025 年新增一笔支出 50 → 余额 150
  addRecord({ type: 'expense', amount: 50, categoryId: 'food', accountId: 'a', note: '', date: '2025-03-10' })
  ok('2025 新增支出后 a 余额=150', accountBalanceOf('a') === 150)

  // 再次结转至 2026（链式发展，不能重复计入）
  const res2 = carryOver(2026)
  ok('二次结转成功', res2.ok === true && res2.year === 2026)
  ok('二次结转后 a 余额=150（无重复计入）', accountBalanceOf('a') === 150)
  ok('封账年份更新为 2026', carryOverYear() === 2026)

  // 不能再结转更早的年份
  const bad = carryOver(2025)
  ok('结转更早年份被拒绝', bad.ok === false)
  // 不能重复结转同年
  const same = carryOver(2026)
  ok('重复结转同年被拒绝', same.ok === false)

  // 撤销结转
  undoCarryOver()
  ok('撤销后封账年份=0', carryOverYear() === 0)
  // 撤销后所有真实流水恢复为未封存：2023(300-100) + 2025支出50 = 150
  ok('撤销后 a 余额=150（2023 与 2025 流水全部解封）', accountBalanceOf('a') === 150)
}

console.log(`\n全部通过：${pass} 项断言`)
