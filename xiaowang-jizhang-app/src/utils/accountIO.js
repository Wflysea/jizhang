/**
 * 账户信息（一级类型下的二级账号）导入 / 导出
 * - 导出：JSON（完整保真，可原样回导）
 * - 导入：JSON 或 Excel（.xlsx），自动识别
 */
import * as XLSX from 'xlsx'
import { state } from '../store/ledger.js'
import { ACCOUNT_GROUPS, normalizeGroupId } from '../data/categories.js'

const FILE_TAG = 'xiaowang-jizhang-accounts'

function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

function groupNameOf(groupId) {
  const g = ACCOUNT_GROUPS.find(x => x.id === groupId)
  return g ? g.name : ''
}

/** 触发浏览器下载 */
function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- 导出 ---------- */

/** 导出为 JSON（含账号名、所属类型，可原样导入） */
export function exportAccountsJson(balances) {
  const balMap = new Map((balances || []).map(a => [a.id, a.balance]))
  const data = {
    app: FILE_TAG,
    type: 'accounts',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: state.accounts.map(a => ({
      id: a.id,
      groupId: a.groupId,
      groupName: groupNameOf(a.groupId),
      name: a.name,
      balance: Math.round((balMap.get(a.id) || 0) * 100) / 100
    }))
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  download(blob, `小王记账_账户_${stamp()}.json`)
  return data.accounts.length
}

/** 导出为 Excel（便于在电脑上查看 / 批量编辑后再导入） */
export function exportAccountsXlsx(balances) {
  const rows = (balances || []).map(a => ({
    '账户类型': groupNameOf(a.groupId),
    '账号名称': a.name,
    '余额': Math.round(a.balance * 100) / 100,
    '流水笔数': a.count
  }))
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws, '账户')
  XLSX.writeFile(wb, `小王记账_账户_${stamp()}.xlsx`)
  return rows.length
}

/* ---------- 导入 ---------- */

/**
 * 解析导入文件，支持 .json / .xlsx / .xls
 * @returns {Promise<{accounts: Array<{groupId:string,name:string}>, source:string}>}
 */
export function parseAccountsFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))

    reader.onload = () => {
      try {
        const name = (file.name || '').toLowerCase()
        if (name.endsWith('.json')) {
          const data = JSON.parse(String(reader.result))
          const raw = Array.isArray(data) ? data : data.accounts
          if (!Array.isArray(raw)) throw new Error('JSON 中找不到 accounts 数组')
          return resolve({
            accounts: raw.map(normalizeRow).filter(Boolean),
            source: 'JSON'
          })
        }
        // Excel：按列名定位，兼容「账户类型/类型」「账号名称/名称」
        const wb = XLSX.read(reader.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        if (!rows.length) throw new Error('表格为空')

        const head = rows[0].map(c => String(c).trim())
        // 只有能识别出「名称列」才算有表头，否则整表都当数据
        const iName = head.findIndex(h => /账号|名称/.test(h))
        const iGroup = head.findIndex(h => /类型|分组/.test(h))
        const hasHead = iName >= 0
        const body = hasHead ? rows.slice(1) : rows

        const list = body
          .map(r => {
            const cells = (Array.isArray(r) ? r : [r]).map(c => String(c ?? '').trim()).filter(Boolean)
            if (!cells.length) return null
            // 无表头时：末列当账号名，首列当账户类型
            return normalizeRow({
              name: iName >= 0 ? r[iName] : cells[cells.length - 1],
              groupName: iGroup >= 0 ? r[iGroup] : (cells.length >= 2 ? cells[0] : ''),
              groupId: ''
            })
          })
          .filter(Boolean)
        if (!list.length) throw new Error('表格中没有可用的账号数据')
        resolve({ accounts: list, source: 'Excel' })
      } catch (e) {
        reject(e)
      }
    }

    if ((file.name || '').toLowerCase().endsWith('.json')) reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

/** 归一为 {groupId, name}；名称为空或无法识别时返回 null */
function normalizeRow(row) {
  if (!row) return null
  const name = String(row.name ?? '').trim()
  if (!name) return null

  let groupId = String(row.groupId ?? '').trim()
  const groupName = String(row.groupName ?? '').trim()

  // 中文类型名优先（导出的 Excel / JSON 里都有 groupName）
  if (groupName) {
    const g = ACCOUNT_GROUPS.find(x => x.name === groupName)
    groupId = g ? g.id : groupId
  }
  // 兼容 Excel 单元格里填的是类型名而非 id
  if (!ACCOUNT_GROUPS.some(x => x.id === groupId)) {
    const g = ACCOUNT_GROUPS.find(x => x.name === groupId)
    if (g) groupId = g.id
  }
  return { groupId: normalizeGroupId(groupId), name: name.slice(0, 16) }
}

/**
 * 写入账号列表
 * @param {Array} list 已归一化的账号
 * @param {'merge'|'replace'} mode 合并（跳过重复）/ 覆盖（替换全部）
 * @returns {{added:number, skipped:number, total:number}}
 */
export function applyImport(rawList, mode = 'merge') {
  // 统一在此归一（类型名 → groupId、去空、截断长度），保证任何来源都安全
  const list = (rawList || []).map(normalizeRow).filter(Boolean)
  if (!list.length) return { added: 0, skipped: 0, total: state.accounts.length }

  if (mode === 'replace') {
    const used = new Set()
    state.accounts = list.map((a, i) => {
      let id = String(a.id || '').trim()
      // id 缺失或重复时生成新 id，避免与流水归属冲突
      if (!id || used.has(id)) id = `imp_${Date.now()}_${i}`
      used.add(id)
      return { id, groupId: a.groupId, name: a.name }
    })
    return { added: state.accounts.length, skipped: 0, total: state.accounts.length }
  }

  let added = 0, skipped = 0
  const exist = new Set(state.accounts.map(a => `${a.groupId}|${a.name}`))
  const ids = new Set(state.accounts.map(a => a.id))
  let n = 0
  for (const a of list) {
    const key = `${a.groupId}|${a.name}`
    if (exist.has(key)) { skipped++; continue }
    let id = String(a.id || '').trim()
    if (!id || ids.has(id)) id = `imp_${Date.now()}_${n}`
    ids.add(id); exist.add(key); n++
    state.accounts.push({ id, groupId: a.groupId, name: a.name })
    added++
  }
  return { added, skipped, total: state.accounts.length }
}

/** 弹出系统文件选择器，返回选中的文件 */
export function pickFile(accept = '.json,.xlsx,.xls') {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => { resolve(input.files[0] || null); input.remove() }
    input.click()
  })
}
