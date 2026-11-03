<script setup>
import { computed, reactive, ref } from 'vue'
import {
  state, RANGES, rangeBounds, shiftMonth, nowMonth,
  summaryOfRange, groupsOfRange, openEdit,
  removeRecord, duplicateRecord, accountName, transferText
} from '../store/ledger.js'
import { getCategory } from '../data/categories.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/* 一级菜单（今天 / 本周 / 本月 / 本年）展开状态，默认展开「本月」 */
const open = reactive({ today: false, week: false, month: true, year: false })
function isOpen(id) { return !!open[id] }
function toggle(id) {
  open[id] = !open[id]
  if (!open[id]) closeSwipe()   // 收起分项时，关闭可能展开的左右滑操作
}

/* 一级菜单图标 */
const RANGE_ICON = { today: '📅', week: '🗓️', month: '📆', year: '📈' }
function boundsLabel(range) { return rangeBounds(range).label }

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

/** 复制：生成今天的新记录后直接进入编辑状态，方便改金额 / 账户 / 日期 */
function actCopy(r) {
  const id = duplicateRecord(r.id)
  closeSwipe()
  if (!id) { toast('复制失败'); return }
  openEdit(id)
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
    <!-- 顶部品牌栏 -->
    <header class="topbar">
      <h1>明细</h1>
      <p class="sub">按 今天 / 本周 / 本月 / 本年 分类查看</p>
    </header>

    <!-- 一级菜单：今天 / 本周 / 本月 / 本年（竖向排列） -->
    <div class="menu">
      <section
        v-for="r in RANGES" :key="r.id"
        class="acc" :class="{ open: isOpen(r.id) }"
      >
        <button class="acc-head" @click="toggle(r.id)">
          <span class="ico">{{ RANGE_ICON[r.id] }}</span>
          <span class="name">{{ r.name }}</span>
          <span class="sum">
            <em class="expense">支 {{ money(summaryOfRange(r.id).expense) }}</em>
            <em class="income">收 {{ money(summaryOfRange(r.id).income) }}</em>
          </span>
          <span class="chev"></span>
        </button>

        <!-- 二级菜单：详细信息（该范围的流水明细） -->
        <div v-show="isOpen(r.id)" class="acc-body">
          <!-- 仅「本月」支持左右翻月 -->
          <div v-if="r.id === 'month'" class="month-bar">
            <button @click="state.month = shiftMonth(state.month, -1)">‹</button>
            <span class="month">{{ state.month.replace('-', '年') }}月</span>
            <button :disabled="isCurrent" @click="!isCurrent && (state.month = shiftMonth(state.month, 1))">›</button>
          </div>
          <div v-else class="range-label">{{ boundsLabel(r.id) }}</div>

          <template v-if="groupsOfRange(r.id).length">
            <div v-for="g in groupsOfRange(r.id)" :key="g.date" class="day">
              <div class="day-head">
                <span class="d">{{ g.date.slice(8) }}日 {{ weekday(g.date) }}</span>
                <span class="s">
                  <em v-if="g.income" class="income">收 {{ money(g.income) }}</em>
                  <em v-if="g.expense" class="expense">支 {{ money(g.expense) }}</em>
                </span>
              </div>

              <div v-for="item in g.items" :key="item.id" class="row">
                <div
                  class="item"
                  :class="{ dragging: dragId === item.id }"
                  :style="{ transform: `translateX(${tx(item)}px)` }"
                  @pointerdown="onDown(item, $event)"
                  @pointermove="onMove(item, $event)"
                  @pointerup="onUp(item, $event)"
                  @pointercancel="onUp(item, $event)"
                  @click="onItemClick(item)"
                >
                  <span class="ico" :class="{ tf: item.type === 'transfer' }">{{ iconOf(item) }}</span>
                  <div class="mid">
                    <div class="name">{{ titleOf(item) }}</div>
                    <div class="sub">{{ subOf(item) }}</div>
                  </div>
                  <span class="amt amount-font" :class="item.type">
                    {{ item.type === 'transfer' ? '' : (item.type === 'income' ? '+' : '-') }}{{ money(item.amount) }}
                  </span>
                </div>

                <!-- 左滑露出的操作区 -->
                <div class="acts">
                  <button class="act copy" @click="actCopy(item)">复制</button>
                  <button class="act edit" @click="actEdit(item)">编辑</button>
                  <button class="act del" @click="actDel(item)">删除</button>
                </div>
              </div>
            </div>

            <!-- 收支结余 -->
            <div class="balance-row">
              <span class="lab">结余</span>
              <span
                class="bal amount-font"
                :class="summaryOfRange(r.id).balance >= 0 ? 'pos' : 'neg'"
              >{{ money(summaryOfRange(r.id).balance) }}</span>
            </div>
          </template>

          <div v-else class="empty-mini">{{ r.name }}还没有记账</div>
        </div>
      </section>
    </div>

    <p class="tip">点击记录可编辑，左滑可复制 / 编辑 / 删除</p>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<style scoped>
.topbar {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(16px + var(--safe-top)) 16px 16px;
}
.topbar h1 { font-size: 19px; font-weight: 700; }
.topbar .sub { font-size: 11px; opacity: .85; margin-top: 3px; }

/* 一级菜单容器 */
.menu { padding: 10px 0 4px; }

/* 折叠卡片 */
.acc {
  background: #fff;
  border-radius: 12px;
  margin: 10px 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .04);
}

/* 一级菜单项（竖向排列） */
.acc-head {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 14px;
  background: #fff;
}
.acc-head .ico {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--brand-light);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.acc-head .name { font-size: 15px; font-weight: 600; flex-shrink: 0; }
.acc-head .sum {
  flex: 1; text-align: right; font-size: 11px; color: var(--text-2);
  display: flex; gap: 10px; justify-content: flex-end;
}
.acc-head .sum em { font-style: normal; }
.acc-head .sum .expense { color: var(--expense); }
.acc-head .sum .income { color: var(--income); }

/* 展开箭头 */
.chev {
  width: 8px; height: 8px; flex-shrink: 0;
  border-right: 2px solid var(--text-3);
  border-bottom: 2px solid var(--text-3);
  transform: rotate(45deg);
  transition: transform .2s ease;
  margin-left: 2px;
}
.acc.open .chev { transform: rotate(225deg); }

/* 二级菜单内容 */
.acc-body { background: #fff; padding-bottom: 6px; }
.month-bar {
  display: flex; align-items: center; justify-content: center; gap: 18px;
  padding: 6px 0 10px; border-bottom: 1px solid var(--line);
}
.month-bar button { font-size: 20px; color: var(--text-2); width: 28px; }
.month-bar button:disabled { opacity: .35; }
.month-bar .month { font-size: 15px; font-weight: 600; }
.range-label {
  text-align: center; font-size: 13px; color: var(--text-3);
  padding: 8px 0 10px; border-bottom: 1px solid var(--line);
}

/* 日分组（二级明细内部） */
.day { background: #fff; }
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

/* 收支结余 */
.balance-row {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 12px 14px 6px; margin-top: 2px;
  border-top: 1px solid var(--line);
}
.balance-row .lab { font-size: 13px; color: var(--text-2); }
.balance-row .bal { font-size: 20px; font-weight: 600; }
.balance-row .bal.pos { color: var(--income); }
.balance-row .bal.neg { color: var(--expense); }

.empty-mini { text-align: center; padding: 28px 0; color: var(--text-3); font-size: 13px; }

.tip { text-align: center; font-size: 11px; color: var(--text-3); padding: 14px 0 4px; }

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
