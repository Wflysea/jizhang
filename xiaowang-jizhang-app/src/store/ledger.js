import { reactive, computed, watch } from 'vue'
import {
  getCategory, ACCOUNT_GROUPS, DEFAULT_ACCOUNTS, normalizeGroupId
} from '../data/categories.js'

const STORAGE_KEY = 'xwj_records_v1'
const SEED_KEY = 'xwj_seeded_v1'
const ACCOUNT_KEY = 'xwj_accounts_v1'

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

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return fmtMonth(d)
}

/* ---------- 示例数据：首次启动填充，保证图表不为空 ---------- */
function seedRecords() {
  const list = []
  const base = new Date()
  const expensePool = [
    ['food', 18, 90], ['food', 25, 45], ['transport', 3, 60], ['transport', 8, 200],
    ['shopping', 60, 500], ['daily', 20, 120], ['entertain', 30, 150],
    ['housing', 1800, 2600], ['telecom', 50, 100], ['medical', 40, 300]
  ]
  const incomePool = [['salary', 9000, 13000], ['bonus', 500, 3000], ['invest', 50, 800]]

  const rand = (a, b) => a + Math.random() * (b - a)
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  for (let m = 5; m >= 0; m--) {
    const d = new Date(base.getFullYear(), base.getMonth() - m, 1)
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const maxDay = m === 0 ? base.getDate() : daysInMonth

    // 每月固定工资
    list.push({
      id: `s_${m}_salary`, type: 'income', amount: Math.round(rand(9500, 12500)),
      categoryId: 'salary', accountId: 'bank',
      date: fmtDate(new Date(d.getFullYear(), d.getMonth(), Math.min(10, maxDay))),
      note: '月薪', createdAt: Date.now()
    })

    const count = Math.round(rand(22, 34))
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(Math.random() * maxDay)
      const [cid, lo, hi] = pick(expensePool)
      const date = fmtDate(new Date(d.getFullYear(), d.getMonth(), day))
      list.push({
        id: `s_${m}_${i}`, type: 'expense',
        amount: Math.round(rand(lo, hi) * 100) / 100,
        categoryId: cid, accountId: pick(['alipay', 'wechat', 'bank', 'cash']),
        date, note: '', createdAt: Date.now()
      })
    }
    if (Math.random() > 0.45) {
      const [cid, lo, hi] = pick(incomePool)
      list.push({
        id: `s_${m}_bonus`, type: 'income',
        amount: Math.round(rand(lo, hi)),
        categoryId: cid, accountId: 'alipay',
        date: fmtDate(new Date(d.getFullYear(), d.getMonth(), 1 + Math.floor(Math.random() * maxDay))),
        note: '', createdAt: Date.now()
      })
    }
  }
  return list
}

/* ---------- 具体账号（二级）持久化 ---------- */
function loadAccounts() {
  let list = null
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
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

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* 解析失败则回落到示例数据 */ }
  if (!localStorage.getItem(SEED_KEY)) {
    const seeded = seedRecords()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    localStorage.setItem(SEED_KEY, '1')
    return seeded
  }
  return []
}

/* ---------- 全局状态 ---------- */
export const state = reactive({
  records: loadRecords(),
  accounts: loadAccounts(),
  month: nowMonth(),
  /** 记一笔弹层：null | { type, categoryId, amount, note, date, accountId } */
  editing: null
})

watch(
  () => state.records,
  (v) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch (e) { /* 忽略配额错误 */ }
  },
  { deep: true }
)

watch(
  () => state.accounts,
  (v) => {
    try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(v)) } catch (e) { /* 忽略配额错误 */ }
  },
  { deep: true }
)

/* ---------- 派生数据 ---------- */
export const monthRecords = computed(() =>
  state.records
    .filter(r => r.date.slice(0, 7) === state.month)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)))
)

export const monthSummary = computed(() => {
  let income = 0, expense = 0
  for (const r of monthRecords.value) {
    if (r.type === 'income') income += r.amount
    else expense += r.amount
  }
  return { income, expense, balance: income - expense }
})

/** 按日分组，用于明细页瀑布列表 */
export const dailyGroups = computed(() => {
  const map = new Map()
  for (const r of monthRecords.value) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()].map(([date, items]) => {
    let income = 0, expense = 0
    for (const r of items) (r.type === 'income' ? (income += r.amount) : (expense += r.amount))
    return { date, items, income, expense }
  })
})

/** 分类聚合统计，用于饼图与排行榜 */
export function categoryStats(type) {
  const map = new Map()
  for (const r of monthRecords.value) {
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

/** 近 6 个月收支趋势 */
export const trend = computed(() => {
  const out = []
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(state.month, -i)
    let income = 0, expense = 0
    for (const r of state.records) {
      if (r.date.slice(0, 7) !== m) continue
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }
    out.push({ month: m, label: `${Number(m.split('-')[1])}月`, income, expense })
  }
  return out
})

/** 二级：每个具体账号的余额与流水笔数 */
export const accountBalances = computed(() =>
  state.accounts.map(a => {
    let balance = 0, count = 0
    for (const r of state.records) {
      if (r.accountId !== a.id) continue
      balance += r.type === 'income' ? r.amount : -r.amount
      count++
    }
    return { ...a, balance, count }
  })
)

/** 一级：按账户类型分组，组内包含该类型下的具体账号 */
export const accountGroups = computed(() =>
  ACCOUNT_GROUPS.map(g => {
    const items = accountBalances.value.filter(a => a.groupId === g.id)
    return { ...g, items, balance: items.reduce((s, a) => s + a.balance, 0) }
  })
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

export function openAdd(type = 'expense') {
  state.editing = {
    id: null,
    type,
    amount: '',
    categoryId: getCategory(type, 'food').id,
    accountId: defaultAccountId(),
    note: '',
    date: today()
  }
}

/** 打开已有记录的编辑页（明细点击 / 左滑「编辑」） */
export function openEdit(id) {
  const r = state.records.find(x => x.id === id)
  if (!r) return
  state.editing = {
    id: r.id,
    type: r.type,
    amount: String(r.amount),
    categoryId: r.categoryId,
    accountId: r.accountId,
    note: r.note || '',
    date: r.date
  }
}

/** 复制一条记录：金额/分类/账户/备注不变，日期取今天 */
export function duplicateRecord(id) {
  const r = state.records.find(x => x.id === id)
  if (!r) return null
  const newId = `${Date.now()}_${seq++}_copy`
  state.records.unshift({ ...r, id: newId, createdAt: Date.now(), date: today() })
  state.month = today().slice(0, 7)
  return newId
}

/** 默认选中账号：优先微信零钱，缺失时取第一个账号 */
function defaultAccountId() {
  const list = state.accounts
  return (list.find(a => a.id === 'wechat') || list[0] || {}).id || ''
}

export function closeAdd() { state.editing = null }

export function saveEditing() {
  const e = state.editing
  if (!e) return false
  const amount = parseFloat(e.amount)
  if (!amount || amount <= 0) return false
  const payload = {
    type: e.type,
    amount: Math.round(amount * 100) / 100,
    categoryId: e.categoryId,
    accountId: e.accountId,
    note: e.note.trim(),
    date: e.date
  }
  if (e.id) {
    const r = state.records.find(x => x.id === e.id)
    if (r) Object.assign(r, payload)
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
  localStorage.setItem(SEED_KEY, '1')
}

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

/** 删除账号：已有流水不删除，仅解除归属（明细中显示为「已删除账号」） */
export function removeAccount(id) {
  const i = state.accounts.findIndex(a => a.id === id)
  if (i > -1) state.accounts.splice(i, 1)
}

export function accountName(id) {
  const a = state.accounts.find(x => x.id === id)
  return a ? a.name : '已删除账号'
}
