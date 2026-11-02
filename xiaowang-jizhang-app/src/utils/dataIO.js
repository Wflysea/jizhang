/**
 * 统一的数据导入 / 导出
 *
 * 一个入口同时处理「账户信息」和「账目流水」：
 * - 导出：JSON 完整备份（账号 + 流水，可原样回导）/ Excel（明细流水 + 账户 + 分类汇总 + 月度汇总）
 * - 导入：自动识别文件内容是完整备份、仅账户、还是仅流水；支持「合并」与「覆盖」两种方式
 *
 * 兼容旧版文件：账户 JSON（type: 'accounts'）与账户 Excel 仍可正常导入。
 */
import * as XLSX from 'xlsx'
import { state } from '../store/ledger.js'
import { ACCOUNT_GROUPS, getCategories, normalizeGroupId } from '../data/categories.js'
import { exportFile, utf8ToBase64 } from './fileExport.js'

const APP_TAG = 'xiaowang-jizhang'

function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function groupNameOf(groupId) {
  const g = ACCOUNT_GROUPS.find(x => x.id === groupId)
  return g ? g.name : ''
}

const pad2 = n => String(n).padStart(2, '0')

/* ==================== 导出 ==================== */

/** 构造完整备份数据（账号 + 全部流水） */
export function buildBackup() {
  return {
    app: APP_TAG,
    type: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: state.accounts.map(a => ({
      id: a.id,
      groupId: a.groupId,
      groupName: groupNameOf(a.groupId),
      name: a.name,
      counted: !a.excluded        // false = 不计入资产
    })),
    records: state.records.map(r => {
      const o = {
        id: r.id,
        type: r.type,             // income / expense / transfer
        amount: r.amount,
        date: r.date,
        note: r.note || ''
      }
      if (r.type === 'transfer') {
        o.fromAccountId = r.fromAccountId
        o.toAccountId = r.toAccountId
      } else {
        o.categoryId = r.categoryId
        o.accountId = r.accountId
      }
      return o
    })
  }
}

/** 导出 JSON 完整备份 */
export function exportBackupJson() {
  const data = buildBackup()
  const name = `小王记账_备份_${stamp()}.json`
  const b64 = utf8ToBase64(JSON.stringify(data, null, 2))
  return {
    file: exportFile(name, b64, 'application/json'),
    name,
    accounts: data.accounts.length,
    records: data.records.length
  }
}

const money2 = n => Math.round((Number(n) || 0) * 100) / 100

/** 账户信息行（导出用） */
export function accountRows(balances) {
  const balMap = new Map((balances || []).map(a => [a.id, a]))
  return state.accounts.map(a => {
    const b = balMap.get(a.id)
    return {
      '账户类型': groupNameOf(a.groupId),
      '账号名称': a.name,
      '余额': b ? money2(b.balance) : 0,
      '流水笔数': b ? b.count : 0,
      '计入资产': a.excluded ? '否' : '是'
    }
  })
}

/** 导出 Excel：明细流水 + 账户 + 分类汇总 + 月度汇总 */
export function exportBackupXlsx(balances, summaryBuilders) {
  const wb = XLSX.utils.book_new()

  const detail = state.records
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => summaryBuilders.detailRow(r))
  const wsDetail = XLSX.utils.json_to_sheet(detail)
  wsDetail['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 24 }]
  XLSX.utils.book_append_sheet(wb, wsDetail, '明细流水')

  const wsAcc = XLSX.utils.json_to_sheet(accountRows(balances))
  wsAcc['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsAcc, '账户')

  const wsCat = XLSX.utils.json_to_sheet(summaryBuilders.byCategory())
  wsCat['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, wsCat, '分类汇总')

  const wsMon = XLSX.utils.json_to_sheet(summaryBuilders.byMonth())
  wsMon['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsMon, '月度汇总')

  const name = `小王记账_导出_${stamp()}.xlsx`
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  return {
    file: exportFile(name, b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    name,
    accounts: state.accounts.length,
    records: state.records.length
  }
}

/* ==================== 导入：解析 ==================== */

const truthy = v => v === true || v === 'true' || v === 1 || v === '1'

/** 「计入资产」列 → excluded */
function parseCounted(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return false
  return /^(否|不计入|不计|no|n|false|0)$/.test(s)
}

/** 日期归一：支持 2025-01-05 / 2025/1/5 / Excel 序列号 / Date */
function toDate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`

  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`

  // Excel 日期序列号
  const n = Number(s)
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d && d.y) return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`
  }
  return ''
}

/** 类型归一：收入 / 支出 / 转账 */
function toType(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (/转账|transfer/.test(s)) return 'transfer'
  if (/收入|income/.test(s)) return 'income'
  if (/支出|expense/.test(s)) return 'expense'
  return ''
}

/** 分类归一：按 id 或名称匹配，未命中落到「其他」 */
function toCategory(type, v) {
  const s = String(v ?? '').trim()
  const list = getCategories(type)
  const hit = list.find(c => c.id === s || c.name === s)
  if (hit) return hit.id
  return type === 'income' ? 'other_i' : 'other_e'
}

/** 账号行归一 */
function normAccount(row) {
  if (!row) return null
  const name = String(row.name ?? row['账号名称'] ?? row['账号'] ?? row['账户名称'] ?? '').trim()
  if (!name) return null

  let groupId = String(row.groupId ?? '').trim()
  const groupName = String(row.groupName ?? row['账户类型'] ?? row['类型'] ?? '').trim()
  if (groupName) {
    const g = ACCOUNT_GROUPS.find(x => x.name === groupName)
    if (g) groupId = g.id
  }
  if (!ACCOUNT_GROUPS.some(x => x.id === groupId)) {
    const g = ACCOUNT_GROUPS.find(x => x.name === groupId)
    if (g) groupId = g.id
  }

  let excluded = false
  if (row.excluded !== undefined && row.excluded !== null && row.excluded !== '') excluded = truthy(row.excluded)
  else if (row.counted !== undefined && row.counted !== null && row.counted !== '') excluded = !truthy(row.counted)
  else if (row['计入资产'] !== undefined) excluded = parseCounted(row['计入资产'])

  return {
    id: String(row.id ?? '').trim(),
    groupId: normalizeGroupId(groupId),
    name: name.slice(0, 16),
    excluded
  }
}

/**
 * 流水行归一 → 草稿（账户用名称表示，写入时再映射成 id）
 * @returns {null|object} 无法识别的行返回 null
 */
function normRecord(row) {
  if (!row) return null
  const amount = Number(String(row.amount ?? row['金额'] ?? '').toString().replace(/[¥,\s]/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const date = toDate(row.date ?? row['日期'])
  if (!date) return null

  const type = toType(row.type ?? row['类型'])
  if (!type) return null

  const o = {
    id: String(row.id ?? '').trim(),
    type,
    amount: money2(amount),
    date,
    note: String(row.note ?? row['备注'] ?? '').trim().slice(0, 30)
  }

  // 账户引用可能来自三种写法：列名（外部表格）、账户名（Excel 导出）、账户 id（JSON 备份）
  const accRaw = String(row.account ?? row['账户'] ?? row.accountName ?? '').trim()
  const idRef = String(row.accountIdRef ?? row.accountId ?? '').trim()

  if (type === 'transfer') {
    // 导入时优先按 id 还原；没有 id 时再按名称匹配或自动新建
    const fromIdRef = String(row.fromIdRef ?? row.fromAccountId ?? '').trim()
    const toIdRef = String(row.toIdRef ?? row.toAccountId ?? '').trim()

    let from = String(row.fromAccount ?? row['转出账户'] ?? row.from ?? row.fromName ?? '').trim()
    let to = String(row.toAccount ?? row['转入账户'] ?? row.to ?? row.toName ?? '').trim()
    if (!from && !to && accRaw) [from, to] = accRaw.split(/\s*(?:→|->|至|to)\s*/)
    if (!from && !to && !fromIdRef && !toIdRef) return null

    o.fromName = from.slice(0, 16)
    o.toName = to.slice(0, 16)
    o.fromIdRef = fromIdRef
    o.toIdRef = toIdRef
  } else {
    o.categoryId = toCategory(type, row.categoryId ?? row['分类'] ?? row.category ?? '')
    if (!accRaw && !idRef) return null
    o.accountName = accRaw.slice(0, 16)
    o.accountIdRef = idRef
  }
  return o
}

/**
 * 解析导入文件（.json / .xlsx / .xls）
 * @returns {Promise<{kind, source, accounts, records}>}
 *   kind: 'backup'（账号+流水）| 'accounts'（仅账号）| 'records'（仅流水）
 */
export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))

    reader.onload = () => {
      try {
        const fname = (file.name || '').toLowerCase()

        if (fname.endsWith('.json')) {
          const data = JSON.parse(String(reader.result))
          const accounts = Array.isArray(data.accounts)
            ? data.accounts.map(normAccount).filter(Boolean)
            : []
          const records = Array.isArray(data.records)
            ? data.records.map(normRecord).filter(Boolean)
            : []
          // 旧版「仅账户」文件：accounts 在根数组或 data.accounts
          const rootArr = Array.isArray(data) ? data.map(normAccount).filter(Boolean) : []
          const accList = accounts.length ? accounts : rootArr

          if (!accList.length && !records.length) throw new Error('文件中没有可导入的数据')
          resolve({
            kind: accList.length && records.length ? 'backup' : (accList.length ? 'accounts' : 'records'),
            source: 'JSON',
            accounts: accList,
            records
          })
          return
        }

        /* Excel */
        const wb = XLSX.read(reader.result, { type: 'array' })
        const accounts = []
        const records = []

        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
          if (!rows.length) continue
          const head = Object.keys(rows[0])

          const isAccountSheet = /账户|账号/.test(sheetName) ||
            (head.some(h => /账号|账户名称/.test(h)) && !head.some(h => /日期/.test(h)))
          const isRecordSheet = /明细|流水|账目|记录/.test(sheetName) ||
            (head.some(h => /日期/.test(h)) && head.some(h => /金额/.test(h)))
          // 分类汇总 / 月度汇总这类统计表不参与导入
          const isSummarySheet = /汇总|统计/.test(sheetName)

          if (isAccountSheet) {
            for (const r of rows) { const a = normAccount(r); if (a) accounts.push(a) }
          } else if (isRecordSheet && !isSummarySheet) {
            for (const r of rows) { const x = normRecord(r); if (x) records.push(x) }
          }
        }

        if (!accounts.length && !records.length) {
          throw new Error('表格中没有可导入的数据（需含「账户」或「明细流水」工作表）')
        }
        resolve({
          kind: accounts.length && records.length ? 'backup' : (accounts.length ? 'accounts' : 'records'),
          source: 'Excel',
          accounts,
          records
        })
      } catch (e) {
        reject(e)
      }
    }

    if ((file.name || '').toLowerCase().endsWith('.json')) reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

/* ==================== 导入：写入 ==================== */

let accSeq = 0
let recSeq = 0

/**
 * 生成「账户引用 → accountId」的解析器。
 * 顺序：原 id 命中 → 账户名命中 → 自动新建（归入金融账户），
 * 保证导入外部表格时流水不会因为账户不存在而丢失。
 */
function makeResolver(result) {
  const byId = new Set(state.accounts.map(a => a.id))
  const byName = new Map(state.accounts.map(a => [a.name, a.id]))
  const ensure = (name, idRef) => {
    if (idRef && byId.has(idRef)) return idRef
    if (name && byName.has(name)) return byName.get(name)
    const id = `imp_a_${Date.now()}_${accSeq++}`
    state.accounts.push({ id, groupId: 'financial', name: name || '导入账户', excluded: false })
    byId.add(id)
    if (name) byName.set(name, id)
    result.createdAccounts++
    return id
  }
  return { ensure }
}

/**
 * 写入导入的数据
 * @param {{accounts:Array, records:Array}} data parseImportFile 的结果
 * @param {'merge'|'replace'} mode 合并（跳过重复）/ 覆盖（替换全部）
 * @returns {{addedAccounts, skippedAccounts, addedRecords, skippedRecords, createdAccounts}}
 */
export function applyImport(data, mode = 'merge') {
  const rawAccounts = (data.accounts || []).map(normAccount).filter(Boolean)
  const rawRecords = (data.records || []).map(normRecord).filter(Boolean)
  const result = { addedAccounts: 0, skippedAccounts: 0, addedRecords: 0, skippedRecords: 0, createdAccounts: 0 }

  if (mode === 'replace') {
    const used = new Set()
    state.accounts = rawAccounts.map((a, i) => {
      let id = a.id
      if (!id || used.has(id)) id = `imp_a_${Date.now()}_${i}`
      used.add(id)
      return { id, groupId: a.groupId, name: a.name, excluded: a.excluded }
    })
    result.addedAccounts = state.accounts.length

    // id → 名称 → 自动新建，保证流水不会因账户缺失而丢失归属
    const { ensure } = makeResolver(result)

    state.records = rawRecords.map((r, i) => {
      const o = {
        id: r.id || `imp_r_${Date.now()}_${i}`,
        type: r.type,
        amount: r.amount,
        date: r.date,
        note: r.note,
        createdAt: Date.now()
      }
      if (r.type === 'transfer') {
        o.fromAccountId = ensure(r.fromName, r.fromIdRef)
        o.toAccountId = ensure(r.toName, r.toIdRef)
      } else {
        o.categoryId = r.categoryId
        o.accountId = ensure(r.accountName, r.accountIdRef)
      }
      return o
    })
    result.addedRecords = state.records.length
    return result
  }

  /* ---------- merge ---------- */
  const existKey = new Set(state.accounts.map(a => `${a.groupId}|${a.name}`))
  const ids = new Set(state.accounts.map(a => a.id))
  for (const a of rawAccounts) {
    const key = `${a.groupId}|${a.name}`
    if (existKey.has(key)) { result.skippedAccounts++; continue }
    let id = a.id
    if (!id || ids.has(id)) id = `imp_a_${Date.now()}_${accSeq++}`
    ids.add(id); existKey.add(key)
    state.accounts.push({ id, groupId: a.groupId, name: a.name, excluded: a.excluded })
    result.addedAccounts++
  }

  const { ensure } = makeResolver(result)

  const recIds = new Set(state.records.map(r => r.id))
  for (const r of rawRecords) {
    if (r.id && recIds.has(r.id)) { result.skippedRecords++; continue }
    const o = {
      id: r.id || `imp_r_${Date.now()}_${recSeq++}`,
      type: r.type,
      amount: r.amount,
      date: r.date,
      note: r.note,
      createdAt: Date.now()
    }
    if (r.type === 'transfer') {
      o.fromAccountId = ensure(r.fromName, r.fromIdRef)
      o.toAccountId = ensure(r.toName, r.toIdRef)
    } else {
      o.categoryId = r.categoryId
      o.accountId = ensure(r.accountName, r.accountIdRef)
    }
    state.records.unshift(o)
    recIds.add(o.id)
    result.addedRecords++
  }
  return result
}

/** 弹出系统文件选择器，返回选中的文件 */
export function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.xlsx,.xls'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => { resolve(input.files[0] || null); input.remove() }
    input.click()
  })
}
