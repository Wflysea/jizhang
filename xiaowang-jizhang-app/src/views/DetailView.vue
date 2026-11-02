<script setup>
import { computed, ref } from 'vue'
import {
  state, monthSummary, dailyGroups, removeRecord, shiftMonth, nowMonth,
  openEdit, duplicateRecord, accountName, transferText
} from '../store/ledger.js'
import { getCategory } from '../data/categories.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 转账：以「转出 → 转入」形式展示；普通收支显示分类名 */
function titleOf(r) {
  return r.type === 'transfer' ? '转账' : getCategory(r.type, r.categoryId).name
}
function subOf(r) {
  if (r.type === 'transfer') return transferText(r) + (r.note ? ` · ${r.note}` : '')
  return r.note || accountName(r.accountId)
}
function iconOf(r) {
  return r.type === 'transfer' ? '🔄' : getCategory(r.type, r.categoryId).icon
}

const isCurrent = computed(() => state.month === nowMonth())

function weekday(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'))
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const todayStr = new Date()
  const t = `${todayStr.getFullYear()}-${String(todayStr.getMonth() + 1).padStart(2, '0')}-${String(todayStr.getDate()).padStart(2, '0')}`
  if (dateStr === t) return '今天'
  return w
}

/* ===== 左滑操作 ===== */
const ACT_W = 216          // 三个操作按钮总宽（3 × 72）
const swipedId = ref(null) // 当前滑开显示操作的记录 id
const dragId = ref(null)   // 正在拖动中的记录 id
const dragX = ref(0)       // 拖动中的实时位移（负值）

let pid = null, sx = 0, sy = 0, axis = '', base = 0, suppressClick = false

/** 每条记录当前的横向位移 */
function tx(r) {
  if (dragId.value === r.id) return dragX.value
  return swipedId.value === r.id ? -ACT_W : 0
}

function onDown(r, ev) {
  pid = ev.pointerId
  sx = ev.clientX; sy = ev.clientY
  axis = ''
  base = swipedId.value === r.id ? -ACT_W : 0
}

function onMove(r, ev) {
  if (pid !== ev.pointerId) return
  const dx = ev.clientX - sx
  const dy = ev.clientY - sy
  if (!axis) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (axis === 'y') return   // 纵向滚动交给页面
  }
  if (axis !== 'x') return
  dragId.value = r.id
  dragX.value = Math.max(-ACT_W - 24, Math.min(0, base + dx))
}

function onUp(r, ev) {
  if (pid !== ev.pointerId) return
  const dragged = dragId.value === r.id
  if (dragged) {
    // 超过一半宽度则吸附展开，否则回弹收起
    swipedId.value = dragX.value < -ACT_W / 2 ? r.id : null
  }
  dragId.value = null
  dragX.value = 0
  pid = null
  axis = ''
  suppressClick = dragged
}

/** 点击条目进入编辑页 */
function onItemClick(r) {
  if (suppressClick) { suppressClick = false; return }
  if (swipedId.value) { swipedId.value = null; return } // 有展开项时先收起
  openEdit(r.id)
}

function closeSwipe() { swipedId.value = null }

/* ===== 操作按钮 ===== */
const toastMsg = ref('')
let toastTimer = null
function toast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1600)
}

function actCopy(r) {
  const id = duplicateRecord(r.id)
  closeSwipe()
  toast(id ? '已复制为今天的新记录' : '复制失败')
}

function actEdit(r) {
  closeSwipe()
  openEdit(r.id)
}

function actDel(r) {
  if (!confirm('确定删除这条记录？')) return
  removeRecord(r.id)
  closeSwipe()
  toast('已删除')
}
</script>

<template>
  <div class="page" @pointerdown.self="closeSwipe">
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

        <div v-for="r in g.items" :key="r.id" class="row">
          <div
            class="item"
            :class="{ dragging: dragId === r.id }"
            :style="{ transform: `translateX(${tx(r)}px)` }"
            @pointerdown="onDown(r, $event)"
            @pointermove="onMove(r, $event)"
            @pointerup="onUp(r, $event)"
            @pointercancel="onUp(r, $event)"
            @click="onItemClick(r)"
          >
            <span class="ico" :class="{ tf: r.type === 'transfer' }">{{ iconOf(r) }}</span>
            <div class="mid">
              <div class="name">{{ titleOf(r) }}</div>
              <div class="sub">{{ subOf(r) }}</div>
            </div>
            <span class="amt amount-font" :class="r.type">
              {{ r.type === 'transfer' ? '' : (r.type === 'income' ? '+' : '-') }}{{ money(r.amount) }}
            </span>
          </div>

          <!-- 左滑露出的操作区 -->
          <div class="acts">
            <button class="act copy" @click="actCopy(r)">复制</button>
            <button class="act edit" @click="actEdit(r)">编辑</button>
            <button class="act del" @click="actDel(r)">删除</button>
          </div>
        </div>
      </div>
      <p class="tip">点击记录可编辑，左滑可复制 / 编辑 / 删除</p>
    </div>

    <div v-else class="empty">
      <div class="empty-ico">🧾</div>
      <p>本月还没有记账</p>
      <span>点击底部 ＋ 记第一笔</span>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
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

/* 单条记录：内容层 + 操作层 */
.row { position: relative; overflow: hidden; }
.item {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; background: #fff;
  border-bottom: 1px solid #F7F7F7;
  touch-action: pan-y;            /* 纵向滚动交给页面，横向由手势接管 */
  transition: transform .22s cubic-bezier(.22, .61, .36, 1);
  will-change: transform;
}
.item.dragging { transition: none; }
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
.amt.transfer { color: var(--text-2); }
.ico.tf { background: #E6F2FF; }

.acts {
  position: absolute; right: 0; top: 0; bottom: 0; z-index: 1;
  width: 216px; display: flex;
}
.act {
  width: 72px; height: 100%;
  font-size: 14px; color: #fff; font-weight: 500;
}
.act.copy { background: #8C8C8C; }
.act.edit { background: #4DA6FF; }
.act.del  { background: #F5453D; }
.act:active { filter: brightness(.92); }

.tip { text-align: center; font-size: 11px; color: var(--text-3); padding: 14px 0 4px; }

.empty { text-align: center; padding: 70px 0; color: var(--text-3); }
.empty-ico { font-size: 46px; margin-bottom: 10px; }
.empty p { font-size: 14px; color: var(--text-2); margin-bottom: 4px; }
.empty span { font-size: 12px; }

.expense { color: var(--expense); }
.income { color: var(--income); }

.toast {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  background: rgba(0, 0, 0, .78); color: #fff;
  font-size: 13px; padding: 9px 16px; border-radius: 18px;
  z-index: 200; animation: fade .18s ease;
}
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
