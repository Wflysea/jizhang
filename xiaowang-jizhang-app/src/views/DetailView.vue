<script setup>
import { computed } from 'vue'
import {
  state, monthSummary, dailyGroups, removeRecord, shiftMonth, nowMonth
} from '../store/ledger.js'
import { getCategory } from '../data/categories.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const isCurrent = computed(() => state.month === nowMonth())

function weekday(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'))
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const todayStr = new Date()
  const t = `${todayStr.getFullYear()}-${String(todayStr.getMonth() + 1).padStart(2, '0')}-${String(todayStr.getDate()).padStart(2, '0')}`
  if (dateStr === t) return '今天'
  return w
}

function confirmDel(id) {
  if (confirm('确定删除这条记录？')) removeRecord(id)
}
</script>

<template>
  <div class="page">
    <!-- 月份切换 + 收支概览 -->
    <div class="hero">
      <div class="month-bar">
        <button @click="state.month = shiftMonth(state.month, -1)">‹</button>
        <span class="month">{{ state.month.replace('-', '年') }}月</span>
        <button :disabled="isCurrent" @click="!isCurrent && (state.month = shiftMonth(state.month, 1))">›</button>
      </div>

      <div class="summary">
        <div class="cell">
          <span class="lab">支出</span>
          <span class="val amount-font expense">{{ money(monthSummary.expense) }}</span>
        </div>
        <div class="cell">
          <span class="lab">收入</span>
          <span class="val amount-font income">{{ money(monthSummary.income) }}</span>
        </div>
        <div class="cell">
          <span class="lab">结余</span>
          <span class="val amount-font">{{ money(monthSummary.balance) }}</span>
        </div>
      </div>
    </div>

    <!-- 流水 -->
    <div v-if="dailyGroups.length">
      <div v-for="g in dailyGroups" :key="g.date" class="day-card">
        <div class="day-head">
          <span class="d">{{ g.date.slice(8) }}日 {{ weekday(g.date) }}</span>
          <span class="s">
            <em v-if="g.income" class="income">收 {{ money(g.income) }}</em>
            <em v-if="g.expense" class="expense">支 {{ money(g.expense) }}</em>
          </span>
        </div>
        <div
          v-for="r in g.items" :key="r.id"
          class="item" @click="confirmDel(r.id)"
        >
          <span class="ico">{{ getCategory(r.type, r.categoryId).icon }}</span>
          <div class="mid">
            <div class="name">{{ getCategory(r.type, r.categoryId).name }}</div>
            <div class="sub">{{ r.note || '' }}</div>
          </div>
          <span class="amt amount-font" :class="r.type">
            {{ r.type === 'income' ? '+' : '-' }}{{ money(r.amount) }}
          </span>
        </div>
      </div>
      <p class="tip">点击任一记录可删除</p>
    </div>

    <div v-else class="empty">
      <div class="empty-ico">🧾</div>
      <p>本月还没有记账</p>
      <span>点击底部 ＋ 记第一笔</span>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(14px + var(--safe-top)) 16px 18px;
}
.month-bar { display: flex; align-items: center; justify-content: center; gap: 18px; margin-bottom: 14px; }
.month-bar button { font-size: 20px; color: #fff; opacity: .9; width: 28px; }
.month-bar button:disabled { opacity: .35; }
.month { font-size: 15px; font-weight: 600; }

.summary { display: flex; }
.cell { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.lab { font-size: 11px; opacity: .85; }
.val { font-size: 19px; font-weight: 600; }

.day-card { background: #fff; margin: 10px 12px; border-radius: 12px; overflow: hidden; }
.day-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 14px; background: #FAFAFA; border-bottom: 1px solid var(--line);
  font-size: 12px; color: var(--text-2);
}
.day-head .s em { font-style: normal; margin-left: 10px; }

.item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid #F7F7F7; }
.item:last-child { border-bottom: none; }
.item:active { background: #FAFAFA; }
.ico {
  width: 34px; height: 34px; border-radius: 50%; background: var(--bg);
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.mid { flex: 1; min-width: 0; }
.name { font-size: 14px; }
.sub { font-size: 11px; color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amt { font-size: 15px; font-weight: 600; }
.amt.expense { color: var(--expense); }
.amt.income { color: var(--income); }

.tip { text-align: center; font-size: 11px; color: var(--text-3); padding: 14px 0 4px; }

.empty { text-align: center; padding: 70px 0; color: var(--text-3); }
.empty-ico { font-size: 46px; margin-bottom: 10px; }
.empty p { font-size: 14px; color: var(--text-2); margin-bottom: 4px; }
.empty span { font-size: 12px; }

.expense { color: var(--expense); }
.income { color: var(--income); }
</style>
