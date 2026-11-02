<script setup>
import * as XLSX from 'xlsx'
import { state, clearAll, accountName, transferText } from '../store/ledger.js'
import { getCategory } from '../data/categories.js'
import { exportFile, exportToast } from '../utils/fileExport.js'
import pkg from '../../package.json'

/* 导出 Excel：明细流水 + 分类汇总 + 月度汇总 三张工作表 */
async function exportXlsx() {
  if (!state.records.length) {
    alert('还没有任何账目可导出')
    return
  }
  const sorted = state.records.slice().sort((a, b) => (a.date < b.date ? 1 : -1))

  // 表1：明细流水
  const detail = sorted.map(r => ({
    '日期': r.date,
    '类型': r.type === 'transfer' ? '转账' : (r.type === 'income' ? '收入' : '支出'),
    '分类': r.type === 'transfer' ? '转账' : getCategory(r.type, r.categoryId).name,
    '金额': r.amount,
    '账户': transferText(r),
    '备注': r.note || ''
  }))

  // 表2：分类汇总（按类型分别统计；转账不计入收支）
  const catMap = new Map()
  for (const r of state.records) {
    if (r.type === 'transfer') continue
    const key = `${r.type === 'income' ? '收入' : '支出'}-${getCategory(r.type, r.categoryId).name}`
    if (!catMap.has(key)) catMap.set(key, { '类型': r.type === 'income' ? '收入' : '支出', '分类': getCategory(r.type, r.categoryId).name, '金额': 0, '笔数': 0 })
    const it = catMap.get(key)
    it['金额'] += r.amount
    it['笔数'] += 1
  }
  const byCat = [...catMap.values()].sort((a, b) => b['金额'] - a['金额'])

  // 表3：月度汇总
  const monMap = new Map()
  for (const r of state.records) {
    if (r.type === 'transfer') continue
    const m = r.date.slice(0, 7)
    if (!monMap.has(m)) monMap.set(m, { '月份': m, '收入': 0, '支出': 0, '结余': 0 })
    const it = monMap.get(m)
    if (r.type === 'income') it['收入'] += r.amount
    else it['支出'] += r.amount
  }
  const byMonth = [...monMap.values()]
    .map(m => { m['结余'] = m['收入'] - m['支出']; return m })
    .sort((a, b) => (a['月份'] < b['月份'] ? 1 : -1))

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(detail)
  const ws2 = XLSX.utils.json_to_sheet(byCat)
  const ws3 = XLSX.utils.json_to_sheet(byMonth)

  // 列宽自适应
  ws1['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 24 }]
  ws2['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 8 }]
  ws3['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

  XLSX.utils.book_append_sheet(wb, ws1, '明细流水')
  XLSX.utils.book_append_sheet(wb, ws2, '分类汇总')
  XLSX.utils.book_append_sheet(wb, ws3, '月度汇总')

  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const name = `小王记账_导出_${stamp}.xlsx`

  try {
    // 安卓 App 内走系统分享面板导出（WebView 下载不可用）
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    const res = await exportFile(
      name, b64,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    alert(exportToast(res, name))
  } catch (e) {
    alert('导出失败：' + (e.message || e))
  }
}

function reset() {
  if (confirm('确定清空全部账目？此操作不可恢复。')) clearAll()
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <div class="avatar">记</div>
      <div class="who">
        <div class="name">我的账本</div>
        <div class="cnt">共 {{ state.records.length }} 笔记录</div>
      </div>
    </div>

    <div class="section-title">数据</div>
    <div class="card list">
      <button class="li" @click="exportXlsx">
        <span class="li-ico">📄</span><span class="li-txt">导出 Excel</span><span class="arrow">›</span>
      </button>
      <button class="li" @click="reset">
        <span class="li-ico">❌</span><span class="li-txt danger">清空全部数据</span><span class="arrow">›</span>
      </button>
    </div>

    <div class="section-title">设置</div>
    <div class="card list">
      <div class="li"><span class="li-ico">💰</span><span class="li-txt">预算管理</span><span class="arrow">›</span></div>
      <div class="li"><span class="li-ico">🏷️</span><span class="li-txt">分类管理</span><span class="arrow">›</span></div>
    </div>

    <p class="ver">小王记账 v{{ pkg.version }} · Vue3 + Capacitor</p>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(24px + var(--safe-top)) 18px 22px;
  display: flex; align-items: center; gap: 12px;
}
.avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(255,255,255,.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 600;
}
.name { font-size: 16px; font-weight: 600; }
.cnt { font-size: 11px; opacity: .85; margin-top: 3px; }

.list { padding: 0 14px; }
.li {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 13px 0; border-bottom: 1px solid #F7F7F7; text-align: left;
}
.li:last-child { border-bottom: none; }
.li:active { opacity: .6; }
.li-ico { font-size: 17px; width: 24px; text-align: center; }
.li-txt { flex: 1; font-size: 14px; }
.li-txt.danger { color: var(--expense); }
.arrow { color: var(--text-3); font-size: 17px; }

.ver { text-align: center; font-size: 11px; color: var(--text-3); padding: 20px 0; }
</style>
