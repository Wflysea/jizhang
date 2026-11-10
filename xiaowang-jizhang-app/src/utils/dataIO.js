/**
 * 统一的数据导入 / 导出（仅 Excel）
 *
 * 一个入口同时处理「账户信息」和「账目流水」：
 * - 导出：Excel 工作簿 —— 明细流水 + 账户 + 分类汇总 + 月度汇总
 * - 导入：同一份 Excel，自动识别「账户」表与「明细流水」表；支持「合并」与「覆盖」两种方式
 *
 * 导出的表格可直接改完再导回，账户表与流水表少了也能单独导入。
 */
import * as XLSX from 'xlsx'
import { state, accountName } from '../store/ledger.js'
import { ACCOUNT_GROUPS, getCategories, getCategory, normalizeGroupId } from '../data/categories.js'
import { exportFile } from './fileExport.js'
import {
  zipStore, unzip, isZip, base64ToBytes, bytesToBase64,
  bytesToDataUrl, dataUrlToBytes, extOfMime
} from './zip.js'

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
      '计入资产': a.excluded ? '否' : '是',
      '账号ID': a.id            // 回导时按 ID 匹配，避免重复
    }
  })
}

/** 模板行（导出用）：账户写名称，回导时按名称/id 还原，避免账户 id 变化后失效 */
export function templateRows() {
  return state.templates.map(t => ({
    '模板名称': t.name,
    '类型': t.type === 'transfer' ? '转账' : (t.type === 'income' ? '收入' : '支出'),
    '分类': t.type === 'transfer' ? '转账' : getCategory(t.type, t.categoryId).name,
    '金额': t.amount === '' || t.amount == null ? '' : money2(t.amount),
    '账户': t.type === 'transfer'
      ? `${t.fromAccountId ? accountName(t.fromAccountId) : ''} → ${t.toAccountId ? accountName(t.toAccountId) : ''}`
      : (t.accountId ? accountName(t.accountId) : ''),
    '备注': t.note || '',
    '模板ID': t.id
  }))
}

/** 导出备份：明细流水 + 账户 + 分类汇总 + 月度汇总 + 模板（+ 凭证图片）
 *  - 含凭证图片时打包为 .zip（内含 data.xlsx 与 images/ 目录）
 *  - 不含图片时直接导出 .xlsx，保持向后兼容
 */
export function exportBackup(balances, summaryBuilders) {
  const wb = XLSX.utils.book_new()

  // 先收集凭证图片并生成「记录ID → 图片相对路径」映射
  const imageRefs = new Map()
  const imageFiles = []
  for (const r of state.records) {
    if (!Array.isArray(r.images) || !r.images.length) continue
    const refs = []
    r.images.forEach((img, k) => {
      const parsed = dataUrlToBytes(img)
      if (!parsed) return
      const safeId = String(r.id).replace(/[^A-Za-z0-9_.-]/g, '_')
      const fname = `images/${safeId}_${k}.${extOfMime(parsed.mime)}`
      imageFiles.push({ name: fname, bytes: parsed.bytes })
      refs.push(fname)
    })
    if (refs.length) imageRefs.set(r.id, refs)
  }

  const detail = state.records
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => {
      const row = { ...summaryBuilders.detailRow(r), '记录ID': r.id }
      row['结转'] = r.carryover ? '是' : ''           // 期初余额标记，便于回导还原
      row['凭证图片'] = (imageRefs.get(r.id) || []).join('；')
      return row
    })
  const wsDetail = XLSX.utils.json_to_sheet(detail)
  wsDetail['!cols'] = [{ wch: 12 }, { wch: 9 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 6 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, wsDetail, '明细流水')

  const wsAcc = XLSX.utils.json_to_sheet(accountRows(balances))
  wsAcc['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsAcc, '账户')

  const wsCat = XLSX.utils.json_to_sheet(summaryBuilders.byCategory())
  wsCat['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, wsCat, '分类汇总')

  const wsMon = XLSX.utils.json_to_sheet(summaryBuilders.byMonth())
  wsMon['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsMon, '月度汇总')

  const tpl = templateRows()
  if (tpl.length) {
    const wsTpl = XLSX.utils.json_to_sheet(tpl)
    wsTpl['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 26 }, { wch: 20 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsTpl, '模板')
  }

  const xlsxB64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })

  let file, name, zipped = false
  if (imageFiles.length) {
    // 打包成 ZIP：data.xlsx + images/*
    const zipBytes = zipStore([
      { name: 'data.xlsx', bytes: base64ToBytes(xlsxB64) },
      ...imageFiles
    ])
    name = `小王记账_导出_${stamp()}.zip`
    file = exportFile(name, bytesToBase64(zipBytes), 'application/zip')
    zipped = true
  } else {
    name = `小王记账_导出_${stamp()}.xlsx`
    file = exportFile(name, xlsxB64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  return {
    file, name, zipped,
    accounts: state.accounts.length,
    records: state.records.length,
    templates: tpl.length,
    images: imageFiles.length
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
    id: String(row.id ?? row['账号ID'] ?? '').trim(),
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

  // 期初余额标记（结转导出时写入「结转」列）
  const carryover = /^(是|true|1|yes|y)$/i.test(String(row.carryover ?? row['结转'] ?? '').trim())

  // 记账时间（精确到秒）：优先「时间」列，兼容英文 time；非法则忽略，回退到导入时间
  const rawTime = String(row.time ?? row['时间'] ?? '').trim()
  const time = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(rawTime)
    ? rawTime.length === 5 ? `${rawTime}:00` : rawTime
    : ''

  const o = {
    id: String(row.id ?? row['记录ID'] ?? '').trim(),
    type,
    amount: money2(amount),
    date,
    note: String(row.note ?? row['备注'] ?? '').trim().slice(0, 30),
    time,
    carryover
  }
  // 期初余额：强制使用专用分类，避免按名称映射到「其他」
  if (carryover) o.categoryId = type === 'income' ? 'carryover_i' : 'carryover_e'

  // 账户引用可能来自两种写法：账户名（自己导出的 Excel）或账户 id（账号ID 列）
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
 * 模板行归一 → 草稿（账户用名称表示，写入时再映射成 id）。
 * 同时兼容自身产出的英文字段，保证 applyImport 二次归一幂等。
 */
function normTemplate(row) {
  if (!row) return null
  const name = String(row['模板名称'] ?? row.name ?? '').trim()
  if (!name) return null
  const type = toType(row['类型'] ?? row.type)
  if (!type) return null

  const amountRaw = String(row['金额'] ?? row.amount ?? '').replace(/[¥,\s]/g, '')
  const amtNum = Number(amountRaw)
  const amount = amountRaw !== '' && Number.isFinite(amtNum) && amtNum > 0 ? money2(amtNum) : ''

  const o = {
    id: String(row['模板ID'] ?? row.id ?? '').trim(),
    name: name.slice(0, 16),
    type,
    amount,
    note: String(row['备注'] ?? row.note ?? '').trim().slice(0, 30)
  }
  const accRaw = String(row['账户'] ?? row.account ?? row.accountName ?? '').trim()
  if (type === 'transfer') {
    let from = String(row.fromName ?? '').trim()
    let to = String(row.toName ?? '').trim()
    if (!from && !to && accRaw) [from, to] = accRaw.split(/\s*(?:→|->|至|to)\s*/)
    o.fromName = from.slice(0, 16)
    o.toName = to.slice(0, 16)
  } else {
    o.categoryId = toCategory(type, row['分类'] ?? row.categoryId ?? '')
    o.accountName = accRaw.slice(0, 16)
  }
  return o
}

/**
 * 解析导入文件（仅 .xlsx / .xls）
 * @returns {Promise<{kind, source, accounts, records, templates}>}
 *   kind: 'backup'（账号+流水）| 'accounts'（仅账号）| 'records'（仅流水）
 */
export function parseImportFile(file) {
  const fname = (file.name || '').toLowerCase()
  if (!/\.(xlsx|xls|zip)$/.test(fname)) {
    return Promise.reject(new Error('只支持导入 Excel（.xlsx / .xls）或备份压缩包（.zip），请先用「导出备份」生成'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))

    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result)
        let wb
        let imageMap = {}   // 记录ID → [dataURL, ...]

        if (isZip(buf)) {
          // 压缩包备份：内含 data.xlsx 与 images/*
          const entries = unzip(buf)
          const xlsxName = Object.keys(entries).find(n => /^data\.xlsx$/i.test(n)) ||
            Object.keys(entries).find(n => /\.xlsx$/i.test(n))
          if (!xlsxName || !entries[xlsxName]) {
            throw new Error('压缩包内未找到 Excel 文件（data.xlsx）')
          }
          wb = XLSX.read(entries[xlsxName], { type: 'array' })

          const IMAGE_RE = /^images\/(.+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i
          for (const [name, data] of Object.entries(entries)) {
            if (!data) continue
            const m = name.match(IMAGE_RE)
            if (!m) continue
            const recId = m[1]
            const idx = Number(m[2])
            const mime = /\.png$/i.test(name) ? 'image/png'
              : (/\.webp$/i.test(name) ? 'image/webp'
                : (/\.gif$/i.test(name) ? 'image/gif' : 'image/jpeg'))
            if (!imageMap[recId]) imageMap[recId] = []
            imageMap[recId][idx] = bytesToDataUrl(mime, data)
          }
        } else {
          wb = XLSX.read(reader.result, { type: 'array' })
        }

        const accounts = []
        const records = []
        const templates = []

        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
          if (!rows.length) continue
          const head = Object.keys(rows[0])

          // 「模板」表优先判断，避免被误认成流水表
          const isTemplateSheet = /模板/.test(sheetName) && head.some(h => /模板名称/.test(h))
          const isAccountSheet = /账户|账号/.test(sheetName) ||
            (head.some(h => /账号|账户名称/.test(h)) && !head.some(h => /日期/.test(h)))
          const isRecordSheet = /明细|流水|账目|记录/.test(sheetName) ||
            (head.some(h => /日期/.test(h)) && head.some(h => /金额/.test(h)))
          // 分类汇总 / 月度汇总这类统计表不参与导入
          const isSummarySheet = /汇总|统计/.test(sheetName)

          if (isTemplateSheet) {
            for (const r of rows) { const t = normTemplate(r); if (t) templates.push(t) }
          } else if (isAccountSheet) {
            for (const r of rows) { const a = normAccount(r); if (a) accounts.push(a) }
          } else if (isRecordSheet && !isSummarySheet) {
            for (const r of rows) { const x = normRecord(r); if (x) records.push(x) }
          }
        }

        if (!accounts.length && !records.length && !templates.length) {
          throw new Error('表格中没有可导入的数据（需含「账户」「明细流水」或「模板」工作表）')
        }
        const imageCount = Object.values(imageMap).reduce((s, arr) => s + arr.filter(Boolean).length, 0)
        resolve({
          kind: templates.length && !accounts.length && !records.length
            ? 'templates'
            : (accounts.length && records.length ? 'backup' : (accounts.length ? 'accounts' : 'records')),
          source: isZip(buf) ? 'ZIP 备份' : 'Excel',
          accounts,
          records,
          templates,
          images: imageMap,
          imageCount
        })
      } catch (e) {
        reject(e)
      }
    }

    reader.readAsArrayBuffer(file)
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
 * 模板写入：账户按名称/id 软匹配（匹配不到就留空，不自动新建账户）。
 * replace 时整体替换；merge 时按 id 或「名称+类型+金额」去重。
 * 需在账户处理完之后调用，才能正确还原模板里的账户归属。
 */
function materializeTemplates(rawTemplates, result, replace) {
  const resolveId = name => {
    if (!name) return ''
    const hit = state.accounts.find(a => a.name === name) || state.accounts.find(a => a.id === name)
    return hit ? hit.id : ''
  }
  const build = (r, i) => {
    const t = {
      id: r.id || `imp_t_${Date.now()}_${i}`,
      name: r.name,
      type: r.type,
      amount: r.amount,
      note: r.note
    }
    if (r.type === 'transfer') {
      t.fromAccountId = resolveId(r.fromName)
      t.toAccountId = resolveId(r.toName)
    } else {
      t.categoryId = r.categoryId
      t.accountId = resolveId(r.accountName)
    }
    return t
  }

  if (replace) {
    // 文件未含「模板」表（如旧版导出）时保留现有模板，避免覆盖导入意外丢失
    if (!rawTemplates.length) return
    const used = new Set()
    state.templates = rawTemplates.map((r, i) => {
      const t = build(r, i)
      if (used.has(t.id)) t.id = `imp_t_${Date.now()}_${i}`
      used.add(t.id)
      return t
    })
    result.addedTemplates = state.templates.length
    return
  }

  const ids = new Set(state.templates.map(x => x.id))
  const keys = new Set(state.templates.map(x => `${x.name}|${x.type}|${x.amount}`))
  for (let i = 0; i < rawTemplates.length; i++) {
    const r = rawTemplates[i]
    const key = `${r.name}|${r.type}|${r.amount}`
    if ((r.id && ids.has(r.id)) || keys.has(key)) { result.skippedTemplates++; continue }
    const t = build(r, i)
    ids.add(t.id); keys.add(key)
    state.templates.push(t)
    result.addedTemplates++
  }
}

/**
 * 写入导入的数据
 * @param {{accounts:Array, records:Array, templates:Array}} data parseImportFile 的结果
 * @param {'merge'|'replace'} mode 合并（跳过重复）/ 覆盖（替换全部）
 * @returns {{addedAccounts, skippedAccounts, addedRecords, skippedRecords, createdAccounts, addedTemplates, skippedTemplates}}
 */
export function applyImport(data, mode = 'merge') {
  const rawAccounts = (data.accounts || []).map(normAccount).filter(Boolean)
  const rawRecords = (data.records || []).map(normRecord).filter(Boolean)
  const rawTemplates = (data.templates || []).map(normTemplate).filter(Boolean)
  const imageMap = data.images || {}
  const result = {
    addedAccounts: 0, skippedAccounts: 0,
    addedRecords: 0, skippedRecords: 0, createdAccounts: 0,
    addedTemplates: 0, skippedTemplates: 0
  }

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
        time: r.time,
        note: r.note,
        createdAt: Date.now(),
        carryover: r.carryover
      }
      if (r.type === 'transfer') {
        o.fromAccountId = ensure(r.fromName, r.fromIdRef)
        o.toAccountId = ensure(r.toName, r.toIdRef)
      } else {
        o.categoryId = r.categoryId
        o.accountId = ensure(r.accountName, r.accountIdRef)
      }
      if (imageMap[o.id]) o.images = imageMap[o.id].filter(Boolean).slice()
      return o
    })
    result.addedRecords = state.records.length
    materializeTemplates(rawTemplates, result, true)
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
      time: r.time,
      note: r.note,
      createdAt: Date.now(),
      carryover: r.carryover
    }
    if (r.type === 'transfer') {
      o.fromAccountId = ensure(r.fromName, r.fromIdRef)
      o.toAccountId = ensure(r.toName, r.toIdRef)
    } else {
      o.categoryId = r.categoryId
      o.accountId = ensure(r.accountName, r.accountIdRef)
    }
    if (imageMap[o.id]) o.images = imageMap[o.id].filter(Boolean).slice()
    state.records.unshift(o)
    recIds.add(o.id)
    result.addedRecords++
  }

  materializeTemplates(rawTemplates, result, false)
  return result
}

/** 弹出系统文件选择器，返回选中的文件（仅 Excel） */
export function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,.xlsx,.xls,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => { resolve(input.files[0] || null); input.remove() }
    input.click()
  })
}
