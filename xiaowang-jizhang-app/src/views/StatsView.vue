<script setup>
import { ref, computed } from 'vue'
import { state, categoryStats, monthSummary, trend, shiftMonth, nowMonth } from '../store/ledger.js'

const type = ref('expense')
const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const short = n => n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n)

const stats = computed(() => categoryStats(type.value))
const total = computed(() => stats.value.reduce((a, b) => a + b.amount, 0))
const isCurrent = computed(() => state.month === nowMonth())

/* 环形图：用 stroke-dasharray 逐段绘制 */
const R = 58, C = 2 * Math.PI * R
const segments = computed(() => {
  let acc = 0
  return stats.value.map(s => {
    const len = s.percent * C
    const seg = { ...s, len, offset: acc }
    acc += len
    return seg
  })
})

const maxTrend = computed(() => Math.max(1, ...trend.value.flatMap(t => [t.income, t.expense])))
</script>

<template>
  <div class="page">
    <div class="topbar">
      <div class="month-bar">
        <button @click="state.month = shiftMonth(state.month, -1)">‹</button>
        <span>{{ state.month.replace('-', '年') }}月</span>
        <button :disabled="isCurrent" @click="!isCurrent && (state.month = shiftMonth(state.month, 1))">›</button>
      </div>
      <div class="switch">
        <button :class="{ on: type === 'expense' }" @click="type = 'expense'">支出</button>
        <button :class="{ on: type === 'income' }" @click="type = 'income'">收入</button>
      </div>
    </div>

    <!-- 环形饼图 -->
    <div class="card pie-card">
      <div class="pie-wrap">
        <svg viewBox="0 0 160 160" class="pie">
          <circle cx="80" cy="80" :r="R" fill="none" stroke="#F2F3F5" stroke-width="26" />
          <circle
            v-for="s in segments" :key="s.id"
            cx="80" cy="80" :r="R" fill="none"
            :stroke="s.color" stroke-width="26"
            :stroke-dasharray="`${s.len} ${C - s.len}`"
            :stroke-dashoffset="-s.offset"
            transform="rotate(-90 80 80)"
          />
        </svg>
        <div class="pie-center">
          <span class="pc-lab">{{ type === 'expense' ? '总支出' : '总收入' }}</span>
          <span class="pc-val amount-font">¥{{ money(total) }}</span>
        </div>
      </div>

      <div class="legend">
        <div v-for="s in stats.slice(0, 5)" :key="s.id" class="lg">
          <i :style="{ background: s.color }"></i>
          <span class="lg-name">{{ s.icon }} {{ s.name }}</span>
          <span class="lg-pct">{{ (s.percent * 100).toFixed(1) }}%</span>
        </div>
        <p v-if="!stats.length" class="no-data">本月暂无数据</p>
      </div>
    </div>

    <!-- 分类排行 -->
    <div class="section-title">分类排行</div>
    <div class="card">
      <div v-for="s in stats" :key="s.id" class="rank">
        <span class="rk-ico">{{ s.icon }}</span>
        <div class="rk-body">
          <div class="rk-top">
            <span>{{ s.name }}</span>
            <span class="rk-amt amount-font">¥{{ money(s.amount) }}</span>
          </div>
          <div class="bar"><i :style="{ width: (s.percent * 100) + '%', background: s.color }"></i></div>
        </div>
        <span class="rk-pct">{{ (s.percent * 100).toFixed(0) }}%</span>
      </div>
      <p v-if="!stats.length" class="no-data">暂无数据</p>
    </div>

    <!-- 近 6 月趋势 -->
    <div class="section-title">近半年趋势</div>
    <div class="card">
      <div class="chart">
        <div v-for="t in trend" :key="t.month" class="col">
          <div class="bars">
            <div class="b in" :style="{ height: (t.income / maxTrend * 100) + '%' }"
                 :title="`收 ${money(t.income)}`"></div>
            <div class="b out" :style="{ height: (t.expense / maxTrend * 100) + '%' }"
                 :title="`支 ${money(t.expense)}`"></div>
          </div>
          <span class="x">{{ t.label }}</span>
        </div>
      </div>
      <div class="legend-h">
        <span><i class="dot in"></i>收入</span>
        <span><i class="dot out"></i>支出</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(14px + var(--safe-top)) 16px 16px;
}
.month-bar { display: flex; align-items: center; justify-content: center; gap: 18px; margin-bottom: 12px; }
.month-bar button { font-size: 20px; color: #fff; width: 28px; }
.month-bar button:disabled { opacity: .35; }
.switch { display: flex; background: rgba(255,255,255,.22); border-radius: 20px; padding: 3px; width: 200px; margin: 0 auto; }
.switch button { flex: 1; padding: 6px 0; border-radius: 18px; font-size: 13px; color: #fff; }
.switch button.on { background: #fff; color: var(--brand-dark); font-weight: 600; }

.pie-card { display: flex; align-items: center; gap: 12px; }
.pie-wrap { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
.pie { width: 100%; height: 100%; }
.pie-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
}
.pc-lab { font-size: 11px; color: var(--text-3); }
.pc-val { font-size: 16px; font-weight: 600; }

.legend { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.lg { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.lg i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.lg-name { flex: 1; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-pct { color: var(--text); font-weight: 500; }
.no-data { font-size: 12px; color: var(--text-3); text-align: center; padding: 12px 0; }

.rank { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.rk-ico { font-size: 17px; width: 22px; text-align: center; }
.rk-body { flex: 1; min-width: 0; }
.rk-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.rk-amt { font-weight: 600; }
.bar { height: 6px; background: #F2F3F5; border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; transition: width .3s; }
.rk-pct { font-size: 11px; color: var(--text-3); width: 32px; text-align: right; }

.chart { display: flex; align-items: flex-end; justify-content: space-between; height: 130px; padding: 0 4px; }
.col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bars { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
.b { width: 9px; border-radius: 3px 3px 0 0; min-height: 2px; }
.b.in { background: var(--income); }
.b.out { background: var(--expense); }
.x { font-size: 10px; color: var(--text-3); margin-top: 5px; }

.legend-h { display: flex; justify-content: center; gap: 20px; font-size: 11px; color: var(--text-2); margin-top: 8px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
.dot.in { background: var(--income); }
.dot.out { background: var(--expense); }
</style>
