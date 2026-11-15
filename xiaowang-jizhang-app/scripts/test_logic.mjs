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
const { state, accountBalanceOf, carryOver, undoCarryOver, carryOverYear, carryOverInfo, addRecord, accountBalances, addBudget, updateBudget, removeBudget, getBudget, budgetUsage, totalBudgetOver } = ledger
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

console.log(`\n阶段一通过：${pass} 项断言`)

// ---- 记账时间精确到秒 ----
const { openAdd, openEdit, saveEditing, monthRecords, duplicateRecord, timeOf, nowTime } = ledger
console.log('记账时间精确到秒：')
{
  state.records = []
  state.accounts = [{ id: 'a', groupId: 'financial', name: '现金' }]

  // openAdd 默认带 time（HH:MM:SS）
  openAdd('expense')
  ok('openAdd 默认 time 格式 HH:MM:SS', /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(state.editing.time))
  state.editing.categoryId = 'food'
  state.editing.accountId = 'a'
  state.editing.amount = '12.5'
  saveEditing()
  ok('保存后记录含 time', /^\d{2}:\d{2}:\d{2}$/.test(state.records[0].time))

  // 同日两条记录按 time 倒序（晚的在上）
  state.month = '2024-05'
  state.records = []
  addRecord({ type: 'expense', amount: 10, categoryId: 'food', accountId: 'a', date: '2024-05-01', time: '08:00:00' })
  addRecord({ type: 'expense', amount: 20, categoryId: 'food', accountId: 'a', date: '2024-05-01', time: '20:30:15' })
  addRecord({ type: 'expense', amount: 30, categoryId: 'food', accountId: 'a', date: '2024-05-01', time: '12:05:09' })
  const same = monthRecords.value
  ok('同日按时间倒序（20:30 最前）', same[0].time === '20:30:15' && same[1].time === '12:05:09' && same[2].time === '08:00:00')

  // 跨日排序仍按日期倒序
  state.records = []
  addRecord({ type: 'expense', amount: 1, categoryId: 'food', accountId: 'a', date: '2024-05-02', time: '01:00:00' })
  addRecord({ type: 'expense', amount: 2, categoryId: 'food', accountId: 'a', date: '2024-05-01', time: '23:59:59' })
  const cross = monthRecords.value
  ok('跨日按日期倒序（05-02 在最前）', cross[0].date === '2024-05-02')

  // 旧数据无 time 时，timeOf 由 createdAt 回推到秒（本地时区一致）
  const legacy = { id: 'old', type: 'expense', amount: 5, createdAt: new Date(2024, 0, 1, 9, 8, 7).getTime() }
  ok('timeOf 旧数据回推到秒', timeOf(legacy) === '09:08:07')

  // 编辑时 time 被带入 editing（无 time 的旧记录按 createdAt 回推）
  state.records = [{ id: 'old', type: 'expense', amount: 5, categoryId: 'food', accountId: 'a', date: '2024-01-01', createdAt: new Date(2024, 0, 1, 9, 8, 7).getTime() }]
  openEdit('old')
  ok('openEdit 旧记录 time 由 createdAt 回推', state.editing.time === '09:08:07')

  // duplicateRecord 复制为今天并记录当前时间
  state.records = []
  addRecord({ type: 'expense', amount: 9, categoryId: 'food', accountId: 'a', date: '2024-05-01', time: '10:00:00' })
  const cid = duplicateRecord(state.records[0].id)
  ok('复制记录日期取今天', state.records.find(r => r.id === cid).date === todayStr())
  ok('复制记录带 time（HH:MM:SS）', /^\d{2}:\d{2}:\d{2}$/.test(state.records.find(r => r.id === cid).time))
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- 导入 time 字段 ----
const { applyImport } = await import('../src/utils/dataIO.js')
console.log('导入 time：')
{
  state.records = []
  state.accounts = [{ id: 'a', groupId: 'financial', name: '现金' }]
  // 模拟一份「合并」导入结果（含时间列），验证 time 被保留
  const data = {
    kind: 'records',
    accounts: [{ id: 'a', groupId: 'financial', name: '现金' }],
    records: [{
      id: 'imp1', type: 'expense', amount: 18, date: '2024-04-01',
      time: '07:15:30', categoryId: 'food', accountName: '现金', accountIdRef: 'a'
    }],
    templates: []
  }
  applyImport(data, 'merge')
  const rec = state.records.find(r => r.id === 'imp1')
  ok('导入保留 time（精确到秒）', rec && rec.time === '07:15:30')
}

// ---- 预算管理 ----
console.log('预算管理：')
{
  // 准备：固定月份、清空干扰数据
  state.budgets = []
  state.records = []
  state.accounts = [{ id: 'a', groupId: 'financial', name: '现金' }]
  state.month = '2024-03'

  // 新增总预算 + 分类预算
  const total = addBudget({ categoryId: null, amount: 1000 })
  ok('新增总预算（categoryId=null）', total.categoryId === null && total.amount === 1000 && state.budgets.length === 1)
  ok('getBudget(null) 命中总预算', getBudget(null) && getBudget(null).id === total.id)
  const food = addBudget({ categoryId: 'food', amount: 400 })
  ok('新增分类预算', food.categoryId === 'food' && state.budgets.length === 2)
  ok('同维度预算唯一（getBudget）', getBudget('food').id === food.id)

  // 无支出时剩余=预算、未超支
  ok('无支出时总预算剩余=预算', budgetUsage.value.total.remain === 1000 && !budgetUsage.value.total.over)

  // 加支出：food 300 + shopping 500 = 800（总预算内）
  addRecord({ type: 'expense', amount: 300, categoryId: 'food', accountId: 'a', date: '2024-03-05' })
  addRecord({ type: 'expense', amount: 500, categoryId: 'shopping', accountId: 'a', date: '2024-03-06' })
  ok('总预算已花=800', Math.abs(budgetUsage.value.total.spent - 800) < 0.001)
  ok('总预算剩余=200', Math.abs(budgetUsage.value.total.remain - 200) < 0.001)
  ok('总预算未超支', !budgetUsage.value.total.over)

  // 分类预算 food 已花 300/400
  const fu = budgetUsage.value.categories.find(c => c.categoryId === 'food')
  ok('food 分类预算已花=300', Math.abs(fu.spent - 300) < 0.001)
  ok('food 分类预算剩余=100', Math.abs(fu.remain - 100) < 0.001)
  ok('无分类预算的 shopping 不进分类预算列表', !budgetUsage.value.categories.find(c => c.categoryId === 'shopping'))

  // 再加 300 让总预算超支
  addRecord({ type: 'expense', amount: 300, categoryId: 'transport', accountId: 'a', date: '2024-03-07' })
  ok('总预算超支判定', budgetUsage.value.total.over === true)
  ok('总预算超支额=-100', Math.abs(budgetUsage.value.total.remain + 100) < 0.001)
  ok('totalBudgetOver()=true', totalBudgetOver() === true)

  // 收入 / 转账不计入支出（不影响预算）
  addRecord({ type: 'income', amount: 9999, categoryId: 'salary', accountId: 'a', date: '2024-03-08' })
  addRecord({ type: 'transfer', amount: 50, fromAccountId: 'a', toAccountId: 'a', date: '2024-03-09' })
  ok('收入/转账不影响总预算支出', Math.abs(budgetUsage.value.total.spent - 1100) < 0.001)

  // 修改预算金额
  updateBudget(total.id, { amount: 2000 })
  ok('修改总预算金额生效', getBudget(null).amount === 2000)
  ok('调高预算后不再超支', budgetUsage.value.total.over === false)

  // 删除分类预算
  removeBudget(food.id)
  ok('删除分类预算', !getBudget('food') && state.budgets.length === 1)

  // 预算定义跨月保留，但换月后支出清零
  state.month = '2024-04'
  ok('换月后预算定义保留', state.budgets.length === 1)
  ok('换月后本月支出=0', budgetUsage.value.total.spent === 0)
}

// ---- 余额调整 / 期初余额 不计入收支（含历史污染数据容错） ----
console.log('余额调整不计入收支：')
{
  const { monthSummary, isNonCountable } = ledger
  state.records = []
  state.budgets = []
  state.month = '2024-05'

  // 真实支出 100、收入 200
  addRecord({ type: 'expense', amount: 100, categoryId: 'food', accountId: 'a', date: '2024-05-01' })
  addRecord({ type: 'income', amount: 200, categoryId: 'salary', accountId: 'a', date: '2024-05-02' })

  // 正常余额调整（带 adjust 标志）
  addRecord({ type: 'income', amount: 500, categoryId: 'adjust_i', accountId: 'a', date: '2024-05-03', adjust: true })
  // 历史污染数据：分类仍是 adjust_e，但 adjust 标志已丢失（旧版导入曾产生）
  addRecord({ type: 'expense', amount: 300, categoryId: 'adjust_e', accountId: 'a', date: '2024-05-04' })
  // 期初余额（带 carryover 标志）
  addRecord({ type: 'income', amount: 400, categoryId: 'carryover_i', accountId: 'a', date: '2024-01-01', carryover: true })

  ok('monthSummary 收入=200（不含余额调整/期初）', monthSummary.value.income === 200)
  ok('monthSummary 支出=100（不含污染的分类预算调整）', monthSummary.value.expense === 100)
  ok('isNonCountable 识别 adjust 标志', isNonCountable({ adjust: true }) === true)
  ok('isNonCountable 识别 carryover 标志', isNonCountable({ carryover: true }) === true)
  ok('isNonCountable 按分类 id 兜底 adjust_e', isNonCountable({ categoryId: 'adjust_e' }) === true)
  ok('isNonCountable 按分类 id 兜底 carryover_i', isNonCountable({ categoryId: 'carryover_i' }) === true)
  ok('isNonCountable 不误判普通支出', isNonCountable({ type: 'expense', categoryId: 'food' }) === false)
  ok('isNonCountable 容忍 null', isNonCountable(null) === false)
}

console.log(`\n全部通过：${pass} 项断言`)
