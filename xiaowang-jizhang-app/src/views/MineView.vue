<script setup>
import { state, clearAll } from '../store/ledger.js'

function exportCsv() {
  const head = '日期,类型,分类,金额,账户,备注\n'
  const rows = state.records
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => [r.date, r.type === 'income' ? '收入' : '支出', r.categoryId, r.amount, r.accountId, r.note || ''].join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + head + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `随手记_导出_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
      <button class="li" @click="exportCsv">
        <span class="li-ico">📄</span><span class="li-txt">导出 CSV</span><span class="arrow">›</span>
      </button>
      <button class="li" @click="reset">
        <span class="li-ico">❌</span><span class="li-txt danger">清空全部数据</span><span class="arrow">›</span>
      </button>
    </div>

    <div class="section-title">设置</div>
    <div class="card list">
      <div class="li"><span class="li-ico">💰</span><span class="li-txt">预算管理</span><span class="arrow">›</span></div>
      <div class="li"><span class="li-ico">🏷️</span><span class="li-txt">分类管理</span><span class="arrow">›</span></div>
      <div class="li"><span class="li-ico">🔔</span><span class="li-txt">记账提醒</span><span class="arrow">›</span></div>
      <div class="li"><span class="li-ico">☁️</span><span class="li-txt">云同步</span><span class="arrow">›</span></div>
    </div>

    <p class="ver">随手记复刻版 v1.0 · Vue3 + Capacitor</p>
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
