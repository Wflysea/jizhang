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
  } catch (e) { /* 解析失败则按空账本处理 */ }
  return []
}

/** 记账模板：只存「记一笔」所需的字段，不含日期与记录 id */
function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) { /* 解析失败则按空模板处理 */ }
  return []
}

/* ---------- 全局状态 ---------- */
export const state = reactive({
  records: loadRecords(),
  accounts: loadAccounts(),
  month: nowMonth(),
  /** 明细页时间范围：today | week | month | year */
  range: 'month',
  /** 记账模板列表（持久化） */
  templates: loadTemplates(),
  /** 记一笔弹层：null | { type, categoryId, amount, note, date, accountId } */
  editing: null
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

watch(
  () => state.templates,
  (v) => {
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(v)) } catch (e) { /* 忽略配额错误 */ }
  },
  { deep: true }
)

/* ---------- 派生数据 ---------- */
/** 取 [start, end] 区间内的流水，按日期倒序、同日按录入时间倒序 */
function recordsIn(start, end) {
  return state.records
    .filter(r => r.date >= start && r.date <= end)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)))
}

/** 收支汇总（转账只是资金搬动，不计收入/支出，也不影响结余） */
function summarize(list) {
  let income = 0, expense = 0, transfer = 0
  for (const r of list) {
    if (r.type === 'transfer') { transfer += r.amount; continue }
    if (r.type === 'income') income += r.amount
    else expense += r.amount
  }
  return { income, expense, balance: income - expense, transfer }
}

/** 按日分组，用于明细页瀑布列表 */
function groupByDay(list) {
  const map = new Map()
  for (const r of list) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return [...map.entries()].map(([date, items]) => {
    let income = 0, expense = 0
    for (const r of items) {
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
/** 指定范围的收支汇总（转账不计收支，但影响结余） */
export function summaryOfRange(range) {
  return summarize(recordsInRange(range))
}
/** 指定范围按日分组的明细（二级菜单内容） */
export function groupsOfRange(range) {
  return groupByDay(recordsInRange(range))
}

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
      if (r.type === 'transfer') continue
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }
    out.push({ month: m, label: `${Number(m.split('-')[1])}月`, income, expense })
  }
  return out
})

/** 二级：每个具体账号的余额与流水笔数（含转账转入 / 转出） */
export const accountBalances = computed(() =>
  state.accounts.map(a => {
    let balance = 0, count = 0, transferIn = 0, transferOut = 0
    for (const r of state.records) {
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
)

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

/** 单个账号当前余额（收入 - 支出 + 转入 - 转出） */
export function accountBalanceOf(id) {
  let balance = 0
  for (const r of state.records) {
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
    images: r.images ? [...r.images] : []
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
