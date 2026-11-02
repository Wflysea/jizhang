<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import {
  state, saveEditing, closeAdd, removeEditing, accountGroups, addAccount,
  suggestAccountId, accountBalances, money
} from '../store/ledger.js'
import { getCategories } from '../data/categories.js'

const e = computed(() => state.editing)
const cats = computed(() => getCategories(e.value.type))
const isTransfer = computed(() => e.value.type === 'transfer')

/** 账号 id → 余额，用于转账时展示目标账户余额 */
const balanceMap = computed(() => {
  const m = {}
  for (const a of accountBalances.value) m[a.id] = a.balance
  return m
})
function balOf(id) {
  return id ? money(balanceMap.value[id] ?? 0) : '0.00'
}

/* 每次打开（新增 / 编辑）都重置两级账户选择器 */
watch(
  () => state.editing,
  () => { showPicker.value = false; curGroup.value = null; inlineAdd.value = false }
)

/* ===== 两级账户选择：一级账户类型 → 二级具体账号 =====
 * pickerTarget 决定写入哪个字段：
 *   accountId      —— 普通收支
 *   fromAccountId  —— 转账转出账户
 *   toAccountId    —— 转账转入账户
 */
const showPicker = ref(false)
const curGroup = ref(null)
const pickerTarget = ref('accountId')

/** 当前选择器绑定的账号 id */
const targetId = computed(() => e.value[pickerTarget.value])

/** 当前选中账号所属类型，未选则默认第一个有账号的类型 */
const activeGroup = computed(() => {
  if (curGroup.value) return curGroup.value
  const cur = accountGroups.value.find(g => g.items.some(a => a.id === targetId.value))
  return (cur || accountGroups.value.find(g => g.items.length) || accountGroups.value[0]).id
})
const groupAccounts = computed(() =>
  (accountGroups.value.find(g => g.id === activeGroup.value) || {}).items || []
)

/** 指定字段当前账户的展示文案 */
function labelOf(field) {
  const id = e.value[field]
  const g = accountGroups.value.find(x => x.items.some(a => a.id === id))
  const a = g && g.items.find(x => x.id === id)
  return a ? `${g.icon} ${g.name} · ${a.name}` : '选择账户'
}
const accountLabel = computed(() => labelOf('accountId'))
const fromLabel = computed(() => labelOf('fromAccountId'))
const toLabel = computed(() => labelOf('toAccountId'))
const pickerTitle = computed(() => ({
  accountId: '选择账户',
  fromAccountId: '选择转出账户',
  toAccountId: '选择转入账户'
}[pickerTarget.value] || '选择账户'))

function openPicker(target = 'accountId') {
  pickerTarget.value = target
  const id = e.value[target]
  const g = accountGroups.value.find(x => x.items.some(a => a.id === id))
  curGroup.value = g ? g.id : (accountGroups.value.find(x => x.items.length) || accountGroups.value[0]).id
  showPicker.value = true
  inlineAdd.value = false
}
function pickAccount(a) {
  e.value[pickerTarget.value] = a.id
  showPicker.value = false
}

/* ===== 记账页内直接新建二级账号 ===== */
const inlineAdd = ref(false)
const newAccName = ref('')
const newAccInput = ref(null)

function startInlineAdd() {
  inlineAdd.value = true
  newAccName.value = ''
  nextTick(() => newAccInput.value && newAccInput.value.focus())
}
function cancelInlineAdd() {
  inlineAdd.value = false
  newAccName.value = ''
}
function confirmInlineAdd() {
  const id = addAccount(activeGroup.value, newAccName.value)
  if (!id) return
  e.value[pickerTarget.value] = id      // 新建后即选中
  curGroup.value = activeGroup.value
  cancelInlineAdd()
  showPicker.value = false
}

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
  const cur = e.value
  if (t === 'transfer') {
    // 切到转账：沿用当前账户作为转出方，并自动挑一个不同的转入方
    const from = cur.fromAccountId || cur.accountId || suggestAccountId()
    cur.fromAccountId = from
    if (!cur.toAccountId || cur.toAccountId === from) cur.toAccountId = suggestAccountId(from)
    cur.type = 'transfer'
    return
  }
  // 切回收支：转出账户作为记账账户，并重置为该类型的第一个分类
  cur.accountId = cur.fromAccountId || cur.accountId || suggestAccountId()
  cur.type = t
  cur.categoryId = getCategories(t)[0].id
}

/** 转账：一键互换转出 / 转入账户 */
function swapAccount() {
  const f = e.value.fromAccountId
  e.value.fromAccountId = e.value.toAccountId
  e.value.toAccountId = f
}

function save() {
  if (isTransfer.value) {
    if (!e.value.fromAccountId || !e.value.toAccountId) {
      alert('请分别选择转出账户和转入账户')
      openPicker(e.value.fromAccountId ? 'toAccountId' : 'fromAccountId')
      return
    }
    if (e.value.fromAccountId === e.value.toAccountId) {
      alert('转出账户和转入账户不能相同')
      return
    }
  } else if (!e.value.accountId) {
    alert('还没有账户，请先选择或新建一个账户')
    openPicker('accountId')
    return
  }
  const ok = saveEditing()
  if (!ok) { /* 金额为 0 时不保存，交由 UI 提示 */ e.value.amount = '' }
}

function del() {
  if (confirm('确定删除这条记录？')) removeEditing()
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
        <button :class="{ on: isTransfer }" @click="pickType('transfer')">转账</button>
      </div>
      <button v-if="e.id" class="del" @click="del">删除</button>
      <button class="close" @click="closeAdd">✕</button>
    </header>

    <div class="amount-row">
      <span class="cny">¥</span>
      <span class="amount amount-font">{{ displayAmount }}</span>
    </div>

    <!-- 转账：转出账户 ⇄ 转入账户 -->
    <div v-if="isTransfer" class="transfer">
      <button class="tf-row" @click="openPicker('fromAccountId')">
        <span class="tf-k out">转出</span>
        <span class="tf-v">{{ fromLabel }}</span>
        <span class="tf-b amount-font">¥{{ balOf(e.fromAccountId) }}</span>
      </button>

      <button class="tf-swap" @click="swapAccount" title="互换转出/转入">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8h13l-3.5-3.5" />
          <path d="M20 16H7l3.5 3.5" />
        </svg>
      </button>

      <button class="tf-row" @click="openPicker('toAccountId')">
        <span class="tf-k in">转入</span>
        <span class="tf-v">{{ toLabel }}</span>
        <span class="tf-b amount-font">¥{{ balOf(e.toAccountId) }}</span>
      </button>

      <p class="tf-tip">
        转账不计入收入与支出，只改变两个账户的余额（转出 −、转入 +）
      </p>
    </div>

    <!-- 收支：分类网格 -->
    <div v-else class="cats">
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
      <button v-if="!isTransfer" class="acc" @click="openPicker('accountId')">{{ accountLabel }}</button>
    </div>

    <!-- 两级账户选择器 -->
    <div v-if="showPicker" class="mask" @click="showPicker = false">
      <div class="picker" @click.stop>
        <div class="pk-head">{{ pickerTitle }}</div>
        <div class="pk-body">
          <div class="pk-col">
            <button
              v-for="g in accountGroups" :key="g.id"
              class="pk-item" :class="{ sel: g.id === activeGroup }"
              @click="curGroup = g.id"
            >
              <span>{{ g.icon }}</span>{{ g.name }}
            </button>
          </div>
          <div class="pk-col right">
            <button
              v-for="a in groupAccounts" :key="a.id"
              class="pk-item" :class="{ sel: a.id === targetId }"
              @click="pickAccount(a)"
            >
              <span class="pk-n">
                {{ a.name }}
                <em v-if="a.excluded" class="pk-ex">不计入</em>
              </span>
              <em class="pk-bal amount-font">¥{{ balOf(a.id) }}</em>
            </button>
            <p v-if="!groupAccounts.length && !inlineAdd" class="pk-empty">
              该类型下暂无账号<br />可直接新建
            </p>

            <!-- 记账页内新建账号 -->
            <div v-if="inlineAdd" class="pk-new">
              <input
                ref="newAccInput" v-model="newAccName" class="pk-inp"
                placeholder="账号名称，如：招行储蓄卡" maxlength="16"
                @keyup.enter="confirmInlineAdd"
              />
              <div class="pk-btns">
                <button class="pk-btn ok" @click="confirmInlineAdd">添加</button>
                <button class="pk-btn" @click="cancelInlineAdd">取消</button>
              </div>
            </div>
            <button v-else class="pk-add" @click="startInlineAdd">＋ 新建账号</button>
          </div>
        </div>
      </div>
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
  padding: 6px 17px; border-radius: 18px; font-size: 13.5px; color: var(--text-2);
  transition: .18s;
}
.switch button.on { background: var(--brand); color: #fff; font-weight: 600; }
.close { position: absolute; right: 14px; top: calc(14px + var(--safe-top)); font-size: 18px; color: var(--text-3); }
.del { position: absolute; left: 14px; top: calc(14px + var(--safe-top)); font-size: 13px; color: #F5453D; }

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

/* 转账：转出 ⇄ 转入 */
.transfer {
  flex: 1; overflow-y: auto;
  padding: 14px 16px 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.tf-row {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 12px 12px;
  background: var(--bg); border-radius: 12px;
  text-align: left;
}
.tf-row:active { background: #EFEFEF; }
.tf-k {
  font-size: 12px; font-weight: 600; flex-shrink: 0;
  width: 38px; height: 24px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.tf-k.out { background: #FF7A45; }
.tf-k.in { background: #00B578; }
.tf-v {
  flex: 1; min-width: 0; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tf-b { font-size: 13px; color: var(--text-3); flex-shrink: 0; }
.tf-swap {
  align-self: center; width: 34px; height: 34px; margin: -8px 0;
  border-radius: 50%; background: #fff; color: var(--brand-dark);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2;
}
.tf-swap:active { transform: scale(.9); }
.tf-tip { font-size: 11px; color: var(--text-3); line-height: 1.7; padding: 10px 4px 0; }

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

/* 两级账户选择器 */
.mask {
  position: absolute; inset: 0; z-index: 20;
  background: rgba(0, 0, 0, .38);
  display: flex; align-items: flex-end;
}
.picker {
  width: 100%; background: #fff; border-radius: 14px 14px 0 0;
  max-height: 58%; display: flex; flex-direction: column;
  animation: up .18s ease;
}
.pk-head {
  padding: 12px; text-align: center; font-size: 13px;
  color: var(--text-2); border-bottom: 1px solid var(--line);
}
.pk-body { flex: 1; display: flex; overflow: hidden; min-height: 150px; }
.pk-col { width: 38%; overflow-y: auto; background: var(--bg); }
.pk-col.right { width: 62%; background: #fff; }
.pk-col::-webkit-scrollbar { width: 0; }
.pk-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 6px; width: 100%;
  padding: 12px 14px; font-size: 13px; text-align: left;
}
.pk-bal { font-style: normal; font-size: 11.5px; color: var(--text-3); flex-shrink: 0; }
.pk-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-ex { font-style: normal; font-size: 10px; color: var(--text-3); margin-left: 4px; }
.pk-item.sel { background: #fff; color: var(--brand); font-weight: 600; }
.pk-col.right .pk-item.sel { background: var(--brand-light); }
.pk-empty {
  font-size: 12px; color: var(--text-3);
  padding: 24px 14px; text-align: center; line-height: 1.7;
}
/* 选择器内新建账号 */
.pk-add {
  width: 100%; text-align: left;
  font-size: 13px; color: var(--brand); font-weight: 600;
  padding: 12px 14px; border-top: 1px solid var(--line);
}
.pk-add:active { background: var(--brand-light); }
.pk-new { padding: 10px 12px; border-top: 1px solid var(--line); }
.pk-inp {
  width: 100%; font-size: 13px; padding: 9px 10px;
  background: var(--bg); border-radius: 8px;
}
.pk-btns { display: flex; gap: 8px; margin-top: 8px; }
.pk-btn { flex: 1; font-size: 13px; padding: 8px 0; border-radius: 8px; background: var(--bg); color: var(--text-2); }
.pk-btn.ok { background: var(--brand); color: #fff; font-weight: 600; }
.acc { max-width: 120px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
