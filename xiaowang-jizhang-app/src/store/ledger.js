import { reactive, computed, watch } from 'vue'
import {
  getCategory, ACCOUNT_GROUPS, DEFAULT_ACCOUNTS, normalizeGroupId
} from '../data/categories.js'

/** 金额格式化：1234.5 → 1,234.50 */
export function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const STORAGE_KEY = 'xwj_records_v1'
const ACCOUNT_KEY = 'xwj_accounts_v1'
const TEMPLATE_KEY = 'xwj_templates_v1'
const BUDGET_KEY = 'xwj_budgets_v1'
/* 多账本：账本元数据 + 当前账本 id；默认账本沿用旧的无后缀键，老用户数据无缝保留 */
const BOOKS_KEY = 'xwj_books_v1'
const ACTIVE_BOOK_KEY = 'xwj_active_book_v1'
const DEFAULT_BOOK_ID = 'main'
const DATA_KEYS = [STORAGE_KEY, ACCOUNT_KEY, TEMPLATE_KEY, BUDGET_KEY]

/** 账本数据键：默认账本用旧键，其余账本加 __<id> 后缀，做到数据独立 */
function dataKey(base, bookId) {
  return bookId === DEFAULT_BOOK_ID ? base : `${base}__${bookId}`
}

/* ---------- 日期工具 ---------- */
export function pad(n) { return String(n).padStart(2, '0') }

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function fmtMonth(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export function today() { return fmtDate(new Date()) }
export function nowMonth() { return fmtMonth(new Date()) }

/** 当前时刻，格式 HH:MM:SS（精确到秒，用于记账时间） */
export function nowTime() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 取一笔记录的展示时间（HH:MM:SS）。
 * 优先用记录的 time 字段；旧数据无该字段时，由 createdAt 回推到秒，保证排序与展示一致。
 */
export function timeOf(r) {
  if (r && r.time) return r.time
  const t = r && r.createdAt ? new Date(r.createdAt) : new Date()
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

/** 记录的可比较时间戳（含日期 + 时分秒），用于同日内的精确排序 */
function tsOf(r) {
  if (r.time) {
    const t = Date.parse(`${r.date}T${r.time}`)
    if (!isNaN(t)) return t
  }
  return r.createdAt || 0
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return fmtMonth(d)
}

/* ---------- 账本元数据（多账本） ---------- */
const DEFAULT_BOOK_NAME = '我的账本'

function loadBooks() {
  try {
    const raw = localStorage.getItem(BOOKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(b => ({
          id: String(b.id || DEFAULT_BOOK_ID),
          name: String(b.name || DEFAULT_BOOK_NAME).slice(0, 16),
          createdAt: b.createdAt || Date.now()
        }))
      }
    }
  } catch (e) { /* 解析失败则重建默认账本 */ }
  // 首次启动 / 老用户迁移：建一个默认账本，沿用旧键数据
  const list = [{ id: DEFAULT_BOOK_ID, name: DEFAULT_BOOK_NAME, createdAt: Date.now() }]
  try { localStorage.setItem(BOOKS_KEY, JSON.stringify(list)) } catch (e) {}
  return list
}

function loadActiveBookId(books) {
  let id = null
  try { id = localStorage.getItem(ACTIVE_BOOK_KEY) } catch (e) {}
  if (id && books.some(b => b.id === id)) return id
  return books[0] ? books[0].id : DEFAULT_BOOK_ID
}

/* ---------- 具体账号（二级）持久化 ---------- */
function loadAccounts(bookId) {
  let list = null
  try {
    const raw = localStorage.getItem(dataKey(ACCOUNT_KEY, bookId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) list = parsed
    }
  } catch (e) { /* 解析失败则回落到默认账号 */ }

  if (!list) return DEFAULT_ACCOUNTS.map(a => ({ ...a }))

  // 迁移：旧版组名 → 新版五大账户类型，并补齐新增的默认账号
  const migrated = list.map(a => ({ ...a, groupId: normalizeGroupId(a.groupId) }))
  const ids = new Set(migrated.map(a => a.id))
  for (const d of DEFAULT_ACCOUNTS) {
    if (!ids.has(d.id)) migrated.push({ ...d })
  }
  return migrated
}

function loadRecords(bookId) {
  try {
    const raw = localStorage.getItem(dataKey(STORAGE_KEY, bookId))
    if (raw) return JSON.parse(raw)
  } catch (e) { /* 解析失败则按空账本处理 */ }
  return []
}

/** 记账模板：只存「记一笔」所需的字段，不含日期与记录 id */
function loadTemplates(bookId) {
  try {
    const raw = localStorage.getItem(dataKey(TEMPLATE_KEY, bookId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) { /* 解析失败则按空模板处理 */ }
  return []
}

/** 预算：只存预算字段；按账本隔离 */
function loadBudgets(bookId) {
  try {
    const raw = localStorage.getItem(dataKey(BUDGET_KEY, bookId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map(b => ({
          id: b.id || `bg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          categoryId: (b.categoryId === undefined || b.categoryId === null) ? null : String(b.categoryId),
          amount: Number(b.amount) || 0,
          createdAt: b.createdAt || Date.now()
        }))
      }
    }
  } catch (e) { /* 解析失败则按空处理 */ }
  return []
}

/* ---------- 全局状态 ---------- */
const _books = loadBooks()
const _activeBookId = loadActiveBookId(_books)

export const state = reactive({
  /** 账本列表（持久化）：[{ id, name, createdAt }] */
  books: _books,
  /** 当前账本 id（持久化） */
  activeBookId: _activeBookId,
  records: loadRecords(_activeBookId),
  accounts: loadAccounts(_activeBookId),
  month: nowMonth(),
  /** 明细页时间范围：today | week | month | year */
  range: 'month',
  /** 记账模板列表（持久化） */
  templates: loadTemplates(_activeBookId),
  /** 预算列表（持久化，按自然月维度；categoryId 为 null 表示总预算） */
  budgets: loadBudgets(_activeBookId),
  /** 记一笔弹层：null | { type, categoryId, amount, note, date, accountId } */
  editing: null,
  /** 预算管理全屏页是否打开 */
  budgetOpen: false,
  /** 账本管理全屏页是否打开 */
  bookOpen: false
})

/** 明细页可选的时间范围 */
export const RANGES = [
  { id: 'today', name: '今天' },
  { id: 'week', name: '本周' },
  { id: 'month', name: '本月' },
  { id: 'year', name: '本年' }
]

/**
 * 当前筛选范围的起止日期（含）
 * week 按中国习惯从周一开始；month 跟随 state.month，可左右翻月
 */
export function rangeBounds(range = state.range) {
  const d = new Date()
  if (range === 'today') {
    const t = fmtDate(d)
    return { start: t, end: t, label: t }
  }
  if (range === 'week') {
    const dow = (d.getDay() + 6) % 7                    // 周一 = 0
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
    const a = fmtDate(mon), b = fmtDate(sun)
    return { start: a, end: b, label: `${a.slice(5).replace('-', '.')} - ${b.slice(5).replace('-', '.')}` }
  }
  if (range === 'year') {
    const y = String(d.getFullYear())
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y} 年` }
  }
  const m = state.month
  return { start: `${m}-01`, end: `${m}-31`, label: m.replace('-', '年') + '月' }
}

/* 数据持久化：写入「当前账本」对应的键（切换账本时先保存旧账本再换 id） */
function saveActive(fn) {
  try { fn() } catch (e) { /* 忽略配额错误 */ }
}

watch(
  () => state.records,
  (v) => saveActive(() => localStorage.setItem(dataKey(STORAGE_KEY, state.activeBookId), JSON.stringify(v))),
  { deep: true }
)

watch(
  () => state.accounts,
  (v) => saveActive(() => localStorage.setItem(dataKey(ACCOUNT_KEY, state.activeBookId), JSON.stringify(v))),
  { deep: true }
)

watch(
  () => state.templates,
  (v) => saveActive(() => localStorage.setItem(dataKey(TEMPLATE_KEY, state.activeBookId), JSON.stringify(v))),
  { deep: true }
)

watch(
  () => state.budgets,
  (v) => saveActive(() => localStorage.setItem(dataKey(BUDGET_KEY, state.activeBookId), JSON.stringify(v))),
  { deep: true }
)

watch(
  () => state.books,
  (v) => saveActive(() => localStorage.setItem(BOOKS_KEY, JSON.stringify(v))),
  { deep: true }
)

watch(
  () => state.activeBookId,
  (v) => saveActive(() => localStorage.setItem(ACTIVE_BOOK_KEY, v))
)

/* ---------- 年度结转（封账） ----------
 * 封账逻辑：把某一年的账户余额作为「期初余额」写一笔（日期 = 该年 1 月 1 日），
 * 并把该日之前的所有真实流水标记为「已封存」。封账年份由期初余额记录的最大年份派生，
 * 因此无需单独存储标记，导入导出也天然保持一致。
 *
 * 关键点：已封存的往年流水既不计入余额、也不计入收支统计，避免与期初余额重复计算；
 * 期初余额记录自身（carryover）参与余额、但不计入收支，如同余额调整。
 */
/** 当前封账年份：期初余额记录中的最大年份；无则 0（未封账） */
export function carryOverYear() {
  let y = 0
  for (const r of state.records) {
    if (r.carryover && r.date) {
      const yy = Number(String(r.date).slice(0, 4))
      if (yy > y) y = yy
    }
  }
  return y
}
/** 封账日（含）：早于该日的真实流水视为已封存；空串表示未封账 */
function closedCut() {
  const y = carryOverYear()
  return y ? `${y}-01-01` : ''
}
/** 该条记录是否已封存（期初余额记录自身不算封存） */
function isClosed(r, cut) {
  return !!cut && !r.carryover && r.date < cut
}

/* ---------- 派生数据 ---------- */
/** 取 [start, end] 区间内的流水（排除已封存），按日期倒序、同日按时间（精确到秒）倒序 */
function recordsIn(start, end) {
  const cut = closedCut()
  return state.records
    .filter(r => r.date >= start && r.date <= end && !isClosed(r, cut))
    .sort((a, b) => (a.date === b.date ? tsOf(b) - tsOf(a) : (a.date < b.date ? 1 : -1)))
}

/** 特殊分类 id：余额调整 / 期初余额 */
const ADJUST_CATS = new Set(['adjust_i', 'adjust_e', 'carryover_i', 'carryover_e'])

/**
 * 是否为「不计入收支」的账户修正类流水（余额调整 / 期初余额）。
 * 以显式标志为准，并兼容按分类 id 兜底：历史导入数据可能丢失 adjust 标志，
 * 但只要分类仍是余额调整 / 期初余额类 id，就不应被计入收入/支出，避免旧数据被错误统计。
 */
export function isNonCountable(r) {
  return !!(r && (r.adjust || r.carryover || ADJUST_CATS.has(r.categoryId)))
}

/** 收支汇总（转账只是资金搬动，不计收入/支出，也不影响结余；余额调整同属「账户修正」，不计入收支） */
function summarize(list) {
  let income = 0, expense = 0, transfer = 0
  for (const r of list) {
    if (isNonCountable(r)) continue   // 余额调整 / 期初余额不计入收支
    if (r.type === 'transfer') { transfer += r.amount; continue }
    if (r.type === 'income') income += r.amount
    else expense += r.amount
  }
  return { income, expense, balance: income - expense, transfer }
}

/** 按日分组，用于明细页瀑布列表（余额调整仍列入明细，但不计入日收支小计） */
function groupByDay(list) {
  const map = new Map()
  for (const r of list) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()].map(([date, items]) => {
    let income = 0, expense = 0
    for (const r of items) {
      if (isNonCountable(r)) continue // 余额调整 / 期初余额不计入日收支
      if (r.type === 'transfer') continue
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }
    return { date, items, income, expense }
  })
}

export const monthRecords = computed(() =>
  recordsIn(`${state.month}-01`, `${state.month}-31`)
)

export const monthSummary = computed(() => summarize(monthRecords.value))

/* ---------- 明细页：按「今天 / 本周 / 本月 / 本年」筛选 ---------- */
export const rangeRecords = computed(() => {
  const { start, end } = rangeBounds()
  return recordsIn(start, end)
})
export const rangeSummary = computed(() => summarize(rangeRecords.value))
export const rangeGroups = computed(() => groupByDay(rangeRecords.value))

/* ---------- 明细页：按指定范围取数（一级菜单各分项独立展开用） ---------- */
/** 取指定时间范围内的流水（不依赖当前选中项） */
export function recordsInRange(range) {
  const { start, end } = rangeBounds(range)
  return recordsIn(start, end)
}
/** 指定范围的收支汇总（转账、余额调整均不计入收支） */
export function summaryOfRange(range) {
  return summarize(recordsInRange(range))
}
/** 指定范围按日分组的明细（二级菜单内容） */
export function groupsOfRange(range) {
  return groupByDay(recordsInRange(range))
}

/** 分类聚合统计，用于饼图与排行榜（不含余额调整、转账） */
export function categoryStats(type) {
  const map = new Map()
  for (const r of monthRecords.value) {
    if (isNonCountable(r)) continue  // 余额调整 / 期初余额不计入分类统计
    if (r.type !== type) continue
    map.set(r.categoryId, (map.get(r.categoryId) || 0) + r.amount)
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0)
  return [...map.entries()]
    .map(([id, amount]) => {
      const c = getCategory(type, id)
      return { id, name: c.name, icon: c.icon, color: c.color, amount, percent: total ? amount / total : 0 }
    })
    .sort((a, b) => b.amount - a.amount)
}

/** 近 6 个月收支趋势（不含余额调整、转账） */
export const trend = computed(() => {
  const out = []
  const cut = closedCut()
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(state.month, -i)
    let income = 0, expense = 0
    for (const r of state.records) {
      if (r.date.slice(0, 7) !== m) continue
      if (isClosed(r, cut)) continue       // 已封存往年流水不计入趋势
      if (isNonCountable(r)) continue // 余额调整 / 期初余额不计入趋势
      if (r.type === 'transfer') continue
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }
    out.push({ month: m, label: `${Number(m.split('-')[1])}月`, income, expense })
  }
  return out
})

/** 二级：每个具体账号的余额与流水笔数（含转账转入 / 转出） */
export const accountBalances = computed(() => {
  const cut = closedCut()
  return state.accounts.map(a => {
    let balance = 0, count = 0, transferIn = 0, transferOut = 0
    for (const r of state.records) {
      if (isClosed(r, cut)) continue        // 已封存往年流水不计入余额
      if (r.type === 'transfer') {
        if (r.fromAccountId === a.id) { balance -= r.amount; transferOut += r.amount; count++ }
        else if (r.toAccountId === a.id) { balance += r.amount; transferIn += r.amount; count++ }
        continue
      }
      if (r.accountId !== a.id) continue
      balance += r.type === 'income' ? r.amount : -r.amount
      count++
    }
    return { ...a, balance: Math.round(balance * 100) / 100, count, transferIn, transferOut }
  })
})

/** 一级：按账户类型分组，组内包含该类型下的具体账号 */
export const accountGroups = computed(() =>
  ACCOUNT_GROUPS.map(g => {
    const items = accountBalances.value.filter(a => a.groupId === g.id)
    // 标记为「不计入资产」的账号不计入分组余额与净资产
    const counted = items.filter(a => !a.excluded)
    return {
      ...g,
      items,
      balance: counted.reduce((s, a) => s + a.balance, 0),
      excludedCount: items.length - counted.length
    }
  })
)

/** 净资产：只统计未标记「不计入资产」的账号 */
export const netAssets = computed(() => {
  const sum = accountBalances.value
    .filter(a => !a.excluded)
    .reduce((s, a) => s + a.balance, 0)
  return Math.round(sum * 100) / 100
})

/** 被标记为「不计入资产」的账号数量，用于界面提示 */
export const excludedAccounts = computed(() =>
  accountBalances.value.filter(a => a.excluded)
)

/* ---------- 操作 ---------- */
let seq = 0
export function addRecord(rec) {
  state.records.unshift({
    id: `${Date.now()}_${seq++}`,
    createdAt: Date.now(),
    ...rec
  })
}

export function removeRecord(id) {
  const i = state.records.findIndex(r => r.id === id)
  if (i > -1) state.records.splice(i, 1)
}

/** 单个账号当前余额（收入 - 支出 + 转入 - 转出，排除已封存流水） */
export function accountBalanceOf(id) {
  const cut = closedCut()
  let balance = 0
  for (const r of state.records) {
    if (isClosed(r, cut)) continue
    if (r.type === 'transfer') {
      if (r.fromAccountId === id) balance -= r.amount
      else if (r.toAccountId === id) balance += r.amount
      continue
    }
    if (r.accountId !== id) continue
    balance += r.type === 'income' ? r.amount : -r.amount
  }
  return Math.round(balance * 100) / 100
}

/**
 * 手动调整账号余额：按「新余额 - 当前余额」的差额生成一条「余额调整」流水。
 * 调增记为收入、调减记为支出，保证余额与流水始终自洽。
 * @returns {null|{delta:number, id:string}} 差额为 0 或输入非法时返回 null
 */
export function adjustBalance(accountId, target, date, note) {
  const to = parseFloat(target)
  if (isNaN(to)) return null

  const from = accountBalanceOf(accountId)
  const delta = Math.round((to - from) * 100) / 100
  if (Math.abs(delta) < 0.005) return null

  const type = delta > 0 ? 'income' : 'expense'
  const id = `${Date.now()}_${seq}_adj`
  addRecord({
    id,
    type,
    amount: Math.abs(delta),
    categoryId: type === 'income' ? 'adjust_i' : 'adjust_e',
    accountId,
    note: (note || '').trim() || `余额调整 ${money(from)} → ${money(to)}`,
    date: date || today(),
    adjust: true
  })
  state.month = (date || today()).slice(0, 7)
  return { id, delta, from, to }
}

/**
 * 某账户在指定日期之前的「未封存」余额（用于结转）。
 * 仅统计早于 before 且未被封存的真实流水（含余额调整、转账），
 * 期初余额记录（carryover）本身参与计算，因为它代表更早的封账余额。
 */
function balanceBefore(accountId, before) {
  const cut = closedCut()
  let bal = 0
  for (const r of state.records) {
    if (r.date >= before) continue
    if (isClosed(r, cut)) continue        // 已封存往年流水已在更早的期初余额中体现
    if (r.type === 'transfer') {
      if (r.fromAccountId === accountId) bal -= r.amount
      else if (r.toAccountId === accountId) bal += r.amount
      continue
    }
    if (r.accountId !== accountId) continue
    bal += r.type === 'income' ? r.amount : -r.amount
  }
  return Math.round(bal * 100) / 100
}

/**
 * 年度结转：把截至 (year-1) 年末的账户余额结转为 year 年 1 月 1 日的「期初余额」，
 * 并封存该日之前的所有真实流水。
 * @param {number} year 目标新年（期初余额写入该年 1 月 1 日）
 * @returns {{ok:boolean, msg?:string, year?:number, count?:number}}
 */
export function carryOver(year) {
  const y = Number(year)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { ok: false, msg: '年份无效' }
  }
  const existing = carryOverYear()
  if (existing) {
    if (existing === y) return { ok: false, msg: `已结转至 ${y} 年，无需重复操作` }
    if (existing > y) return { ok: false, msg: `已结转至 ${existing} 年，请先撤销后再结转更早的年份` }
  }
  const before = `${y}-01-01`

  // 移除旧期初余额（单一封账边界，重新生成）
  state.records = state.records.filter(r => !r.carryover)

  const created = []
  for (const a of state.accounts) {
    const bal = balanceBefore(a.id, before)
    if (Math.abs(bal) < 0.005) continue
    const type = bal >= 0 ? 'income' : 'expense'
    addRecord({
      type,
      amount: Math.abs(bal),
      categoryId: type === 'income' ? 'carryover_i' : 'carryover_e',
      accountId: a.id,
      note: `期初余额结转（${y}年）`,
      date: before,
      carryover: true,
      images: []
    })
    created.push(a.id)
  }
  // 封账日由期初余额记录年份自动派生，无需单独标记
  return { ok: true, year: y, count: created.length }
}

/** 撤销结转：删除所有期初余额记录，往年流水自动恢复为未封存 */
export function undoCarryOver() {
  state.records = state.records.filter(r => !r.carryover)
  return true
}

/** 结转信息：是否已结转、封账年份、封存笔数、各账户期初余额 */
export function carryOverInfo() {
  const y = carryOverYear()
  if (!y) return null
  const cut = `${y}-01-01`
  let closedCount = 0
  const openings = []
  for (const r of state.records) {
    if (r.carryover) openings.push(r)
    else if (r.date < cut) closedCount++
  }
  return { year: y, cut, closedCount, openings }
}

export function openAdd(type = 'expense') {
  if (type === 'transfer') { openTransfer(); return }
  state.editing = {
    id: null,
    type,
    amount: '',
    categoryId: getCategory(type, 'food').id,
    accountId: defaultAccountId(),
    note: '',
    date: today(),
    time: nowTime(),
    images: []
  }
}

/**
 * 打开转账页：从 A 账户转到 B 账户，金额只记一次，
 * 保存后生成一条 transfer 流水（转出账户 -、转入账户 +）。
 */
export function openTransfer(fromId) {
  const from = fromId || defaultAccountId()
  state.editing = {
    id: null,
    type: 'transfer',
    amount: '',
    fromAccountId: from,
    toAccountId: suggestAccountId(from),
    note: '',
    date: today(),
    time: nowTime(),
    images: []
  }
}

/** 打开已有记录的编辑页（明细点击 / 左滑「编辑」） */
export function openEdit(id) {
  const r = state.records.find(x => x.id === id)
  if (!r) return
  if (r.type === 'transfer') {
    state.editing = {
      id: r.id,
      type: 'transfer',
      amount: String(r.amount),
      fromAccountId: r.fromAccountId,
      toAccountId: r.toAccountId,
      note: r.note || '',
      date: r.date,
      time: timeOf(r),
      images: r.images ? [...r.images] : []
    }
    return
  }
  state.editing = {
    id: r.id,
    type: r.type,
    amount: String(r.amount),
    categoryId: r.categoryId,
    accountId: r.accountId,
    note: r.note || '',
    date: r.date,
    time: timeOf(r),
    images: r.images ? [...r.images] : []
  }
}

/** 复制一条记录：金额/分类/账户/备注不变，日期取今天，时间取当前 */
export function duplicateRecord(id) {
  const r = state.records.find(x => x.id === id)
  if (!r) return null
  const newId = `${Date.now()}_${seq++}_copy`
  state.records.unshift({ ...r, id: newId, createdAt: Date.now(), date: today(), time: nowTime() })
  state.month = today().slice(0, 7)
  return newId
}

/** 默认选中账号：优先微信零钱，缺失时取第一个账号；无账号时为空（需用户先添加） */
function defaultAccountId() {
  const list = state.accounts
  return (list.find(a => a.id === 'wechat') || list[0] || {}).id || ''
}

/**
 * 推荐一个账号 id：可排除指定账号（转账时避免转入转出同一账户）。
 * 无可选账号时返回空串，由 UI 提示用户先添加账户。
 */
export function suggestAccountId(excludeId) {
  const list = state.accounts.filter(a => a.id !== excludeId)
  return (list.find(a => a.id === 'wechat') || list[0] || {}).id || ''
}

export function closeAdd() { state.editing = null }

/* ---------- 记账模板 ----------
 * 模板 = 一笔记账的「可复用字段」（类型/金额/分类/账户/备注），
 * 不含日期与记录 id，使用时按当天日期填入记账页。
 */
const TEMPLATE_FIELDS = [
  'type', 'amount', 'categoryId', 'accountId', 'fromAccountId', 'toAccountId', 'note'
]
let tplSeq = 0

/** 把一笔记账存成模板；name 为空返回 null */
export function saveAsTemplate(name, editing = state.editing) {
  if (!editing) return null
  const n = String(name || '').trim().slice(0, 16)
  if (!n) return null
  const t = { id: `tpl_${Date.now()}_${tplSeq++}`, name: n }
  for (const f of TEMPLATE_FIELDS) {
    if (editing[f] !== undefined && editing[f] !== null) t[f] = editing[f]
  }
  state.templates.unshift(t)
  return t
}

/**
 * 用模板内容填充当前记账页（就地修改，保留当前编辑的 id 与 date）。
 * 返回 boolean：模板不存在或未打开记账页时返回 false。
 */
export function applyTemplate(id, editing = state.editing) {
  const t = state.templates.find(x => x.id === id)
  if (!t || !editing) return false
  // 先清掉旧字段，避免收支↔转账切换时残留 from/to 或 accountId
  for (const f of TEMPLATE_FIELDS) delete editing[f]
  for (const f of TEMPLATE_FIELDS) {
    if (t[f] !== undefined) editing[f] = t[f]
  }
  return true
}

export function removeTemplate(id) {
  const i = state.templates.findIndex(x => x.id === id)
  if (i > -1) state.templates.splice(i, 1)
}

export function renameTemplate(id, name) {
  const t = state.templates.find(x => x.id === id)
  const n = String(name || '').trim().slice(0, 16)
  if (t && n) t.name = n
}

/**
 * 保存当前编辑内容。
 * @returns {boolean} 保存成功与否；金额为 0、未选账户、转账账户相同时返回 false
 */
export function saveEditing() {
  const e = state.editing
  if (!e) return false
  const amount = parseFloat(e.amount)
  if (!amount || amount <= 0) return false

  /* 转账：校验两个账户都存在且不相同，然后写入一条 transfer 流水 */
  if (e.type === 'transfer') {
    if (!e.fromAccountId || !e.toAccountId) return false
    if (e.fromAccountId === e.toAccountId) return false
    const payload = {
      type: 'transfer',
      amount: Math.round(amount * 100) / 100,
      fromAccountId: e.fromAccountId,
      toAccountId: e.toAccountId,
      note: e.note.trim(),
      date: e.date,
      time: e.time || nowTime(),
      images: e.images ? [...e.images] : []
    }
    if (e.id) {
      const r = state.records.find(x => x.id === e.id)
      if (r) Object.assign(r, payload)
    } else {
      addRecord(payload)
    }
    state.month = e.date.slice(0, 7)
    closeAdd()
    return true
  }

  if (!e.accountId) return false   // 未选择账户（新安装未添加账号时）
  const payload = {
    type: e.type,
    amount: Math.round(amount * 100) / 100,
    categoryId: e.categoryId,
    accountId: e.accountId,
    note: e.note.trim(),
    date: e.date,
    time: e.time || nowTime(),
    images: e.images ? [...e.images] : []
  }
  if (e.id) {
    const r = state.records.find(x => x.id === e.id)
    if (r) {
      // 由转账改回普通收支时，清掉残留的转账字段
      delete r.fromAccountId
      delete r.toAccountId
      Object.assign(r, payload)
    }
  } else {
    addRecord(payload)
  }
  // 自动跳到记账所在月份，让用户立刻看到结果
  state.month = e.date.slice(0, 7)
  closeAdd()
  return true
}

/** 编辑页内删除当前记录 */
export function removeEditing() {
  const e = state.editing
  if (!e || !e.id) return
  removeRecord(e.id)
  closeAdd()
}

export function clearAll() {
  state.records = []
}

/* ---------- 多账本管理 ----------
 * state.records/accounts/templates/budgets 始终是「当前账本」的工作副本，
 * 所有统计与操作 API 无需改动；切换账本时先把当前副本落盘到旧账本键，再加载新账本数据。
 */
let bookSeq = 0

/** 把当前 state 的四类数据同步落盘到指定账本（切换前保存旧账本用） */
function saveBookData(bookId) {
  saveActive(() => localStorage.setItem(dataKey(STORAGE_KEY, bookId), JSON.stringify(state.records)))
  saveActive(() => localStorage.setItem(dataKey(ACCOUNT_KEY, bookId), JSON.stringify(state.accounts)))
  saveActive(() => localStorage.setItem(dataKey(TEMPLATE_KEY, bookId), JSON.stringify(state.templates)))
  saveActive(() => localStorage.setItem(dataKey(BUDGET_KEY, bookId), JSON.stringify(state.budgets)))
}

/** 当前账本对象 */
export function activeBook() {
  return state.books.find(b => b.id === state.activeBookId) || state.books[0]
}

/** 当前账本名字 */
export function activeBookName() {
  const b = activeBook()
  return b ? b.name : DEFAULT_BOOK_NAME
}

/** 读取某账本的流水笔数（用于账本列表展示，不依赖它是否当前账本） */
export function bookRecordCount(bookId) {
  try {
    const raw = localStorage.getItem(dataKey(STORAGE_KEY, bookId))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.length : 0
  } catch (e) { return 0 }
}

/**
 * 切换账本：先落盘当前账本，再加载目标账本数据到 state。
 * @returns {boolean} 成功与否（目标不存在返回 false）
 */
export function switchBook(id) {
  if (!state.books.some(b => b.id === id)) return false
  if (id === state.activeBookId) return true
  saveBookData(state.activeBookId)              // 保存旧账本
  state.activeBookId = id                       // watch 会持久化 ACTIVE_BOOK_KEY
  state.records = loadRecords(id)
  state.accounts = loadAccounts(id)
  state.templates = loadTemplates(id)
  state.budgets = loadBudgets(id)
  state.editing = null
  state.budgetOpen = false
  state.month = nowMonth()
  return true
}

/**
 * 新建账本并切换过去；新账本含默认账户、空流水/模板/预算。
 * @returns {object} 新建的账本对象
 */
export function addBook(name) {
  const id = `bk_${Date.now()}_${bookSeq++}`
  const b = {
    id,
    name: String(name || '').trim().slice(0, 16) || DEFAULT_BOOK_NAME,
    createdAt: Date.now()
  }
  state.books.push(b)                           // watch 会持久化 BOOKS_KEY
  switchBook(id)                                // 落盘旧账本、加载新账本空数据
  // 新账本默认账户落盘（loadAccounts 在无数据时已返回默认账户）
  saveActive(() => localStorage.setItem(dataKey(ACCOUNT_KEY, id), JSON.stringify(state.accounts)))
  return b
}

/** 重命名账本；名字为空返回 false */
export function renameBook(id, name) {
  const b = state.books.find(x => x.id === id)
  const n = String(name || '').trim().slice(0, 16)
  if (!b || !n) return false
  b.name = n
  return true
}

/**
 * 删除账本（至少保留一个）。删除当前账本时先切到另一个再清理其数据键。
 * @returns {boolean} 成功与否
 */
export function removeBook(id) {
  if (state.books.length <= 1) return false
  const idx = state.books.findIndex(b => b.id === id)
  if (idx < 0) return false

  if (id === state.activeBookId) {
    const next = state.books.find(b => b.id !== id)
    switchBook(next.id)                         // 先落盘并切走当前数据
  }
  state.books.splice(idx, 1)                   // watch 会持久化 BOOKS_KEY
  for (const base of DATA_KEYS) {
    saveActive(() => localStorage.removeItem(dataKey(base, id)))
  }
  return true
}

/* ---------- 预算管理 ----------
 * 预算按「自然月」维度设置，作用于每一个月：
 *  - 总预算（budget.categoryId 为 null）：约束整月支出上限
 *  - 分类预算（budget.categoryId 为具体分类 id）：约束该分类的整月支出
 * 预算金额只设置一次、所有月份共用；使用时按「当前查看的月份」统计实际支出。
 * 统计口径与收支汇总一致：转账、余额调整、期初余额均不计入支出。
 */

/** 安全数值：非数字 → 0 */
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

let bgSeq = 0

/** 新增预算；categoryId 为 null/空 表示总预算，否则为具体支出分类 id。返回新建的预算对象 */
export function addBudget({ categoryId, amount }) {
  const amt = Math.round(num(amount) * 100) / 100
  const id = `bg_${Date.now()}_${bgSeq++}`
  const b = {
    id,
    categoryId: (categoryId === undefined || categoryId === null || categoryId === '') ? null : String(categoryId),
    amount: amt,
    createdAt: Date.now()
  }
  state.budgets.push(b)
  return b
}

/** 修改预算金额 / 分类；返回更新后的对象，找不到返回 null */
export function updateBudget(id, patch) {
  const b = state.budgets.find(x => x.id === id)
  if (!b) return null
  if (patch.amount !== undefined) b.amount = Math.round(num(patch.amount) * 100) / 100
  if (patch.categoryId !== undefined) {
    b.categoryId = (patch.categoryId === null || patch.categoryId === '') ? null : String(patch.categoryId)
  }
  return b
}

/** 删除预算 */
export function removeBudget(id) {
  const i = state.budgets.findIndex(x => x.id === id)
  if (i > -1) state.budgets.splice(i, 1)
}

/** 取某分类的预算（categoryId 为 null 表示总预算）；不存在返回 null */
export function getBudget(categoryId) {
  const key = (categoryId === undefined || categoryId === null || categoryId === '') ? null : String(categoryId)
  return state.budgets.find(b => b.categoryId === key) || null
}

/** 当前查看月份的预算执行情况（总预算 + 各分类预算） */
export const budgetUsage = computed(() => {
  const totalBudget = state.budgets.find(b => b.categoryId === null)
  const catBudgets = state.budgets.filter(b => b.categoryId !== null)

  const spentTotal = monthSummary.value.expense
  const out = { total: null, categories: [] }

  if (totalBudget && num(totalBudget.amount) > 0) {
    const amt = num(totalBudget.amount)
    const spent = Math.round(spentTotal * 100) / 100
    const remain = Math.round((amt - spent) * 100) / 100
    out.total = {
      budget: amt,
      spent,
      remain,
      percent: spent > amt ? 1 : (amt > 0 ? spent / amt : 0),
      over: spent > amt
    }
  }

  const stats = categoryStats('expense')
  const statMap = new Map(stats.map(s => [s.id, s.amount]))
  out.categories = catBudgets
    .map(b => {
      const amt = num(b.amount)
      const spent = Math.round((statMap.get(b.categoryId) || 0) * 100) / 100
      const remain = Math.round((amt - spent) * 100) / 100
      const c = getCategory('expense', b.categoryId)
      return {
        id: b.id,
        categoryId: b.categoryId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        budget: amt,
        spent,
        remain,
        percent: spent > amt ? 1 : (amt > 0 ? spent / amt : 0),
        over: spent > amt
      }
    })
    .sort((a, b) => b.percent - a.percent)

  return out
})

/** 当前月份是否已超出总预算（用于首页提示） */
export function totalBudgetOver() {
  const t = budgetUsage.value.total
  return !!(t && t.over)
}

/* ---------- 存储空间占用 ---------- */
/** UTF-8 字节数（优先用 Blob，回退到字符串长度） */
function rawBytes(obj) {
  try {
    const s = JSON.stringify(obj)
    if (typeof Blob !== 'undefined') return new Blob([s]).size
    return s.length
  } catch (e) { return 0 }
}

/** 人类可读的字节数：B / KB / MB */
export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/**
 * 应用本地数据占用（响应 state 变化）：
 * 账目数据（含凭证图片）、账户数据、记账模板，以及合计与图片张数。
 * 仅统计本应用写入 localStorage 的三类数据，不含系统/浏览器其他开销。
 */
export const storageUsage = computed(() => {
  let imageCount = 0, imageBytes = 0
  for (const r of state.records) {
    if (Array.isArray(r.images)) {
      for (const img of r.images) { imageCount++; imageBytes += rawBytes(img) }
    }
  }
  const recBytes = rawBytes(state.records)
  const accBytes = rawBytes(state.accounts)
  const tplBytes = rawBytes(state.templates)
  const items = [
    { key: 'records', name: '账目数据', bytes: recBytes },
    { key: 'accounts', name: '账户数据', bytes: accBytes },
    { key: 'templates', name: '记账模板', bytes: tplBytes }
  ]
  return {
    items,
    total: recBytes + accBytes + tplBytes,
    imageCount,
    imageBytes
  }
})

/* ---------- 具体账号（二级）增删改 ---------- */
let accSeq = 0

/** 返回新账号 id（名称为空时返回 null） */
export function addAccount(groupId, name) {
  const n = (name || '').trim()
  if (!n) return null
  const id = `acc_${Date.now()}_${accSeq++}`
  state.accounts.push({ id, groupId, name: n })
  return id
}

export function renameAccount(id, name) {
  const a = state.accounts.find(x => x.id === id)
  const n = (name || '').trim()
  if (a && n) a.name = n
}

/**
 * 切换账号的「不计入资产」标记。
 * 被标记的账号余额不再计入净资产与各账户类型合计，但流水照常记录。
 * @returns {boolean|null} 切换后的状态；账号不存在时返回 null
 */
export function toggleAccountExcluded(id) {
  const a = state.accounts.find(x => x.id === id)
  if (!a) return null
  a.excluded = !a.excluded
  return a.excluded
}

/** 删除账号：已有流水不删除，仅解除归属（明细中显示为「已删除账号」） */
export function removeAccount(id) {
  const i = state.accounts.findIndex(a => a.id === id)
  if (i > -1) state.accounts.splice(i, 1)
}

export function accountName(id) {
  const a = state.accounts.find(x => x.id === id)
  return a ? a.name : '已删除账号'
}

/** 转账流水说明：转出 → 转入（明细展示与 Excel 导出共用） */
export function transferText(r) {
  if (r.type !== 'transfer') return accountName(r.accountId)
  return `${accountName(r.fromAccountId)} → ${accountName(r.toAccountId)}`
}
