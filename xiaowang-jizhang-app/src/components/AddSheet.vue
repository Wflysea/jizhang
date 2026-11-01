<script setup>
import { computed } from 'vue'
import { state, saveEditing, closeAdd } from '../store/ledger.js'
import { getCategories, ACCOUNTS } from '../data/categories.js'

const e = computed(() => state.editing)
const cats = computed(() => getCategories(e.value.type))

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0']

function press(k) {
  const cur = e.value.amount
  if (k === '.') {
    if (cur === '') e.value.amount = '0.'
    else if (!cur.includes('.')) e.value.amount = cur + '.'
    return
  }
  if (cur.includes('.')) {
    const dec = cur.split('.')[1]
    if (dec.length >= 2) return
  } else if (cur.replace('.', '').length >= 9) {
    return
  }
  if (cur === '0') e.value.amount = k
  else e.value.amount = cur + k
}
function back() { e.value.amount = e.value.amount.slice(0, -1) }
function clear() { e.value.amount = '' }

function pickType(t) {
  e.value.type = t
  e.value.categoryId = getCategories(t)[0].id
}

function save() {
  const ok = saveEditing()
  if (!ok) { /* 金额为 0 时不保存，交由 UI 提示 */ e.value.amount = '' }
}

const displayAmount = computed(() => e.value.amount || '0')
</script>

<template>
  <div class="sheet" v-if="e">
    <!-- 顶部：类型切换 + 金额 -->
    <header class="head">
      <div class="switch">
        <button :class="{ on: e.type === 'expense' }" @click="pickType('expense')">支出</button>
        <button :class="{ on: e.type === 'income' }" @click="pickType('income')">收入</button>
      </div>
      <button class="close" @click="closeAdd">✕</button>
    </header>

    <div class="amount-row">
      <span class="cny">¥</span>
      <span class="amount amount-font">{{ displayAmount }}</span>
    </div>

    <!-- 分类网格 -->
    <div class="cats">
      <button
        v-for="c in cats" :key="c.id"
        class="cat"
        :class="{ sel: e.categoryId === c.id }"
        @click="e.categoryId = c.id"
      >
        <span class="cat-icon" :style="{ background: c.color + '1A' }">{{ c.icon }}</span>
        <span class="cat-name">{{ c.name }}</span>
      </button>
    </div>

    <!-- 备注 / 日期 / 账户 -->
    <div class="meta">
      <input class="note" v-model="e.note" placeholder="添加备注…" maxlength="30" />
      <input class="date" type="date" v-model="e.date" />
      <select class="acc" v-model="e.accountId">
        <option v-for="a in ACCOUNTS" :key="a.id" :value="a.id">{{ a.icon }} {{ a.name }}</option>
      </select>
    </div>

    <!-- 数字键盘 -->
    <div class="keyboard">
      <button v-for="k in KEYS" :key="k" class="key amount-font" @click="press(k)">{{ k }}</button>
      <button class="key fn" @click="back">⌫</button>
      <button class="key fn ok" @click="save">完成</button>
      <button class="key fn" @click="clear">C</button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: absolute;
  inset: 0;
  background: #fff;
  z-index: 100;
  display: flex;
  flex-direction: column;
  padding-bottom: var(--safe-bottom);
  animation: up .22s ease;
}
@keyframes up { from { transform: translateY(100%); } to { transform: translateY(0); } }

.head {
  padding: calc(12px + var(--safe-top)) 14px 0;
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
.switch { display: flex; background: var(--bg); border-radius: 20px; padding: 3px; }
.switch button {
  padding: 6px 26px; border-radius: 18px; font-size: 14px; color: var(--text-2);
  transition: .18s;
}
.switch button.on { background: var(--brand); color: #fff; font-weight: 600; }
.close { position: absolute; right: 14px; top: calc(14px + var(--safe-top)); font-size: 18px; color: var(--text-3); }

.amount-row {
  display: flex; align-items: baseline; justify-content: center;
  gap: 4px; padding: 14px 0 10px;
}
.cny { font-size: 20px; color: var(--text-2); }
.amount {
  font-size: 38px; font-weight: 600;
  min-width: 60px; text-align: center;
  border-bottom: 2px solid var(--brand);
  padding-bottom: 2px;
}

.cats {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 6px;
  padding: 8px 14px;
  align-content: start;
}
.cats::-webkit-scrollbar { width: 0; }
.cat { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; }
.cat-icon {
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  transition: .15s;
}
.cat-name { font-size: 11px; color: var(--text-2); }
.cat.sel .cat-icon { box-shadow: 0 0 0 2px var(--brand); transform: scale(1.06); }
.cat.sel .cat-name { color: var(--brand); font-weight: 600; }

.meta {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-top: 1px solid var(--line);
}
.note { flex: 1; font-size: 13px; padding: 8px 10px; background: var(--bg); border-radius: 8px; }
.date, .acc {
  font-size: 12px; padding: 8px; background: var(--bg); border-radius: 8px; color: var(--text-2);
}

.keyboard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 8px 8px 10px;
  background: var(--bg);
}
.key {
  height: 46px; border-radius: 8px; background: #fff;
  font-size: 20px; color: var(--text);
  box-shadow: 0 1px 0 rgba(0,0,0,.06);
}
.key:active { background: #EFEFEF; }
.key.fn { font-size: 15px; color: var(--text-2); }
.key.ok {
  grid-row: span 2; height: auto;
  background: var(--brand); color: #fff; font-weight: 600; font-size: 16px;
}
</style>
