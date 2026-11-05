<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import {
  state, saveEditing, closeAdd, removeEditing, accountGroups, addAccount,
  suggestAccountId, accountBalances, money, accountName,
  saveAsTemplate, applyTemplate, removeTemplate
} from '../store/ledger.js'
import { getCategories, getCategory } from '../data/categories.js'
import { registerBack } from '../utils/back.js'

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

/* 每次打开（新增 / 编辑）都重置账户选择器与模板弹层 */
watch(
  () => state.editing,
  () => {
    showPicker.value = false; curGroup.value = null; inlineAdd.value = false
    showTemplates.value = false; savingTpl.value = false; tplName.value = ''
  }
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

/* 返回键：先收模板弹层 → 账户选择器 → 关闭整个编辑页（不会直接退出 App） */
onBeforeUnmount(registerBack(() => {
  if (showTemplates.value) { closeTemplates(); return true }
  if (showPicker.value) { showPicker.value = false; return true }
  closeAdd()
  return true
}))

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

/* ===== 记账模板：把当前这笔存成模板 / 从模板快速记账 ===== */
const showTemplates = ref(false)
const savingTpl = ref(false)
const tplName = ref('')
const tplInput = ref(null)

function openTemplates() {
  showPicker.value = false
  savingTpl.value = false
  showTemplates.value = true
}
function closeTemplates() {
  showTemplates.value = false
  savingTpl.value = false
  tplName.value = ''
}

/** 默认模板名：备注 → 分类+金额 → 分类；转账用「转账」 */
function suggestTplName() {
  const cur = e.value
  const note = (cur.note || '').trim()
  if (note) return note.slice(0, 16)
  if (cur.type === 'transfer') return '转账'
  const c = getCategory(cur.type, cur.categoryId)
  const v = evaluate(cur.amount)
  return v != null && v > 0 ? `${c.name} ${v}` : c.name
}
function startSaveTemplate() {
  showPicker.value = false
  showTemplates.value = true
  savingTpl.value = true
  tplName.value = suggestTplName()
  nextTick(() => {
    if (tplInput.value) { tplInput.value.focus(); tplInput.value.select && tplInput.value.select() }
  })
}
function cancelSaveTemplate() {
  savingTpl.value = false
  tplName.value = ''
}
function confirmSaveTemplate() {
  // 表达式（如 12+3）先求值成纯数字再存模板；金额为空可留待使用时再填
  const val = evaluate(e.value.amount)
  const clean = val != null && val > 0 ? String(Math.round(val * 100) / 100) : ''
  const t = saveAsTemplate(tplName.value, { ...e.value, amount: clean })
  if (!t) return                         // 名称为空时保留输入框
  savingTpl.value = false
  tplName.value = ''
}
function useTemplate(id) {
  if (applyTemplate(id, e.value)) closeTemplates()
}
function askDeleteTemplate(t) {
  if (confirm(`删除模板「${t.name}」？`)) removeTemplate(t.id)
}
function iconOf(t) {
  return t.type === 'transfer' ? '🔄' : getCategory(t.type, t.categoryId).icon
}
function descOf(t) {
  const typeName = t.type === 'transfer' ? '转账' : (t.type === 'income' ? '收入' : '支出')
  const bits = [typeName]
  if (t.type === 'transfer') {
    bits.push(`${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`)
  } else {
    bits.push(getCategory(t.type, t.categoryId).name)
    if (t.accountId) bits.push(accountName(t.accountId))
  }
  if (t.note) bits.push(t.note)
  return bits.join(' · ')
}
function amtOf(t) {
  const n = Number(t.amount)
  return Number.isFinite(n) && n > 0 ? '¥' + money(n) : '金额待填'
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0']
const OPS = ['+', '−', '×', '÷']   // − 为 U+2212，视觉更像减号
function isOp(ch) { return OPS.includes(ch) }

/** 安全求值：支持 + − × ÷ 与小数，遵循先乘除后加减；非法或除零返回 null */
function evaluate(expr) {
  if (!expr || typeof expr !== 'string') return null
  const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  if (!/^[\d.+\-*/]+$/.test(s)) return null
  if (/^[+\-*/]/.test(s) || /[+\-*/]$/.test(s)) return null   // 首尾不能是运算符
  const tokens = s.match(/(\d+\.?\d*|\.\d+)|([+\-*/])/g)
  if (!tokens || tokens.length % 2 === 0) return null
  const nums = [], ops = []
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      const n = parseFloat(tokens[i])
      if (isNaN(n)) return null
      nums.push(n)
    } else if (!'+-*/'.includes(tokens[i])) return null
    else ops.push(tokens[i])
  }
  // 第一遍：× ÷
  const r = [nums[0]], rops = []
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '*' || ops[i] === '/') {
      const a = r.pop(), b = nums[i + 1]
      if (ops[i] === '/' && b === 0) return null
      r.push(ops[i] === '*' ? a * b : a / b)
    } else { r.push(nums[i + 1]); rops.push(ops[i]) }
  }
  // 第二遍：+ −
  let res = r[0]
  for (let i = 0; i < rops.length; i++) res = rops[i] === '+' ? res + r[i + 1] : res - r[i + 1]
  return Math.round(res * 100) / 100
}

function press(k) {
  const cur = e.value.amount
  if (k === '.') {
    if (cur === '') { e.value.amount = '0.'; return }
    if (isOp(cur.slice(-1))) { e.value.amount = cur + '0.'; return }
    const seg = cur.split(/[+\-−×÷]/).pop()
    if (seg.includes('.')) return
    e.value.amount = cur + '.'
    return
  }
  if (isOp(k)) {
    if (cur === '') return
    if (isOp(cur.slice(-1))) { e.value.amount = cur.slice(0, -1) + k; return }  // 连续运算符则替换
    e.value.amount = cur + k
    return
  }
  // 数字
  if (cur.length >= 24) return
  if (cur === '') { e.value.amount = k; return }
  if (isOp(cur.slice(-1))) { e.value.amount = cur + k; return }   // 运算符后开启新数字
  const seg = cur.split(/[+\-−×÷]/).pop()                        // 当前正在输入的数字段
  if (seg === '0') { e.value.amount = cur.slice(0, -1) + k; return }
  if (seg.includes('.')) {
    const dec = seg.split('.')[1]
    if (dec.length >= 2) return
  } else if (seg.replace('.', '').length >= 9) {
    return
  }
  e.value.amount = cur + k
}
function back() { e.value.amount = e.value.amount.slice(0, -1) }
function clear() { e.value.amount = '' }

/** 表达式实时计算结果（仅当包含运算符且可求值时返回数字，否则 null） */
const computedResult = computed(() => {
  const expr = e.value.amount
  if (!expr || !/[+\-−×÷]/.test(expr)) return null
  return evaluate(expr)
})

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
  // 先把表达式（如 12.5+3）算出最终金额，非法或 ≤0 不给保存
  const val = evaluate(e.value.amount)
  if (val == null || val <= 0) {
    alert('请输入有效的金额')
    return
  }
  e.value.amount = String(Math.round(val * 100) / 100)
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

    <div class="amount-box">
      <div class="amount-row">
        <span class="cny">¥</span>
        <span class="amount amount-font">{{ displayAmount }}</span>
      </div>
      <div v-if="computedResult != null" class="expr-result amount-font">= {{ money(computedResult) }}</div>
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

    <!-- 账户选择（放大、独立成行，点击弹出选择器） -->
    <button v-if="!isTransfer" class="acc-row" @click="openPicker('accountId')">
      <span class="acc-label">{{ accountLabel }}</span>
      <span class="acc-bal amount-font">¥{{ balOf(e.accountId) }}</span>
      <span class="acc-chev">›</span>
    </button>

    <!-- 备注 / 日期 -->
    <div class="meta">
      <input class="note" v-model="e.note" placeholder="添加备注…" maxlength="30" />
      <input class="date" type="date" v-model="e.date" />
    </div>

    <!-- 模板工具条：使用模板 / 把当前这笔存为模板 -->
    <div class="tpl-bar">
      <button class="tpl-btn" @click="openTemplates">
        📑 使用模板<span v-if="state.templates.length" class="tpl-badge">{{ state.templates.length }}</span>
      </button>
      <button class="tpl-btn save" @click="startSaveTemplate">⭐ 存为模板</button>
    </div>

    <!-- 模板弹层 -->
    <div v-if="showTemplates" class="mask" @click="closeTemplates">
      <div class="picker tpl-picker" @click.stop>
        <div class="pk-head">
          记账模板
          <button class="tpl-x" @click="closeTemplates">✕</button>
        </div>
        <div class="tpl-body">
          <p v-if="!state.templates.length && !savingTpl" class="tpl-empty">
            还没有模板<br />点下方按钮把当前这笔存为模板
          </p>
          <div v-for="t in state.templates" :key="t.id" class="tpl-item">
            <button class="tpl-main" @click="useTemplate(t.id)">
              <span class="tpl-ico">{{ iconOf(t) }}</span>
              <span class="tpl-info">
                <span class="tpl-name">{{ t.name }}</span>
                <span class="tpl-desc">{{ descOf(t) }}</span>
              </span>
              <span class="tpl-amt amount-font">{{ amtOf(t) }}</span>
            </button>
            <button class="tpl-del" @click="askDeleteTemplate(t)" title="删除模板">✕</button>
          </div>
        </div>

        <div v-if="savingTpl" class="pk-new">
          <input
            ref="tplInput" v-model="tplName" class="pk-inp"
            placeholder="模板名称，如：早餐" maxlength="16"
            @keyup.enter="confirmSaveTemplate"
          />
          <div class="pk-btns">
            <button class="pk-btn ok" @click="confirmSaveTemplate">保存模板</button>
            <button class="pk-btn" @click="cancelSaveTemplate">取消</button>
          </div>
        </div>
        <button v-else class="pk-add" @click="startSaveTemplate">＋ 把当前这笔存为模板</button>
      </div>
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

    <!-- 数字键盘：3 列数字区 + 运算符列 + 功能列 -->
    <div class="keyboard">
      <div class="num-pad">
        <button v-for="k in KEYS" :key="k" class="key amount-font" @click="press(k)">{{ k }}</button>
      </div>
      <div class="op-col">
        <button v-for="op in OPS" :key="op" class="key op amount-font" @click="press(op)">{{ op }}</button>
      </div>
      <div class="fn-col">
        <button class="key fn amount-font" @click="back">⌫</button>
        <button class="key fn amount-font" @click="clear">C</button>
        <button class="key fn ok" @click="save">完成</button>
      </div>
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
.del { position: absolute; left: 14px; top: calc(14px + var(--safe-top)); font-size: 14px; color: #F5453D; }

.amount-box { padding-top: 14px; }
.amount-row {
  display: flex; align-items: baseline; justify-content: center;
  gap: 4px; padding: 0 12px 6px;
}
.cny { font-size: 20px; color: var(--text-2); }
.amount {
  font-size: 38px; font-weight: 600;
  min-width: 60px; text-align: center;
  border-bottom: 2px solid var(--brand);
  padding-bottom: 2px;
}
.expr-result {
  text-align: center; font-size: 15px; color: var(--text-2);
  padding-bottom: 10px;
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
.cat-name { font-size: 13px; color: var(--text-2); }
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
  font-size: 14px; font-weight: 600; flex-shrink: 0;
  width: 38px; height: 24px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.tf-k.out { background: #FF7A45; }
.tf-k.in { background: #00B578; }
.tf-v {
  flex: 1; min-width: 0; font-size: 15px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tf-b { font-size: 14px; color: var(--text-3); flex-shrink: 0; }
.tf-swap {
  align-self: center; width: 34px; height: 34px; margin: -8px 0;
  border-radius: 50%; background: #fff; color: var(--brand-dark);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2;
}
.tf-swap:active { transform: scale(.9); }
.tf-tip { font-size: 13px; color: var(--text-3); line-height: 1.7; padding: 10px 4px 0; }

.meta {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-top: 1px solid var(--line);
}
.note { flex: 1; font-size: 14px; padding: 8px 10px; background: var(--bg); border-radius: 8px; }
.date {
  font-size: 14px; padding: 8px; background: var(--bg); border-radius: 8px; color: var(--text-2);
}

/* 账户选择：放大为独立整行，点击弹出选择器 */
.acc-row {
  display: flex; align-items: center; gap: 10px;
  width: calc(100% - 28px);
  margin: 12px 14px 0;
  padding: 14px 14px;
  background: var(--bg); border-radius: 12px;
  text-align: left;
}
.acc-row:active { background: #EFEFEF; }
.acc-label {
  flex: 1; min-width: 0;
  font-size: 14.5px; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.acc-bal { font-size: 14px; color: var(--text-3); flex-shrink: 0; }
.acc-chev { font-size: 18px; color: var(--text-3); flex-shrink: 0; line-height: 1; }

/* 模板工具条 */
.tpl-bar {
  display: flex; gap: 10px;
  padding: 8px 14px 6px;
}
.tpl-btn {
  flex: 1; padding: 9px 6px; border-radius: 9px;
  background: var(--brand-light); color: var(--brand-dark);
  font-size: 14px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 5px;
}
.tpl-btn:active { background: #FCE3BE; }
.tpl-btn.save { background: var(--bg); color: var(--text-2); }
.tpl-btn.save:active { background: #EAEAEA; }
.tpl-badge {
  font-size: 12px; font-weight: 600; color: #fff;
  background: var(--brand); border-radius: 9px;
  min-width: 17px; padding: 0 5px; line-height: 17px;
}

.keyboard {
  display: flex; gap: 6px;
  padding: 8px 8px 10px;
  background: var(--bg);
}
.num-pad {
  flex: 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.op-col {
  flex: 1;
  display: flex; flex-direction: column; gap: 6px;
}
.fn-col {
  flex: 1;
  display: flex; flex-direction: column; gap: 6px;
}
.fn-col .key { flex: 1; }
.key {
  height: 46px; border-radius: 8px; background: #fff;
  font-size: 20px; color: var(--text);
  box-shadow: 0 1px 0 rgba(0,0,0,.06);
}
.key:active { background: #EFEFEF; }
.key.op {
  background: var(--brand-light); color: var(--brand-dark);
  font-size: 22px; font-weight: 600;
}
.key.op:active { background: #FCE3BE; }
.key.fn { font-size: 16px; color: var(--text-2); }
.key.ok {
  flex: 2;
  background: var(--brand); color: #fff; font-weight: 600; font-size: 17px;
}

/* 两级账户选择器 */
.mask {
  position: absolute; inset: 0; z-index: 20;
  background: rgba(0, 0, 0, .38);
  display: flex; align-items: flex-end;
}
.picker {
  width: 100%; background: #fff; border-radius: 14px 14px 0 0;
  max-height: 66%; display: flex; flex-direction: column;
  animation: up .18s ease;
}
.pk-head {
  padding: 14px; text-align: center; font-size: 15px;
  color: var(--text-2); border-bottom: 1px solid var(--line);
}
.pk-body { flex: 1; display: flex; overflow: hidden; min-height: 180px; }
.pk-col { width: 38%; overflow-y: auto; background: var(--bg); }
.pk-col.right { width: 62%; background: #fff; }
.pk-col::-webkit-scrollbar { width: 0; }
.pk-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; width: 100%;
  padding: 15px 16px; font-size: 14.5px; text-align: left;
}
.pk-bal { font-style: normal; font-size: 12.5px; color: var(--text-3); flex-shrink: 0; }
.pk-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-ex { font-style: normal; font-size: 11px; color: var(--text-3); margin-left: 4px; }
.pk-item.sel { background: #fff; color: var(--brand); font-weight: 600; }
.pk-col.right .pk-item.sel { background: var(--brand-light); }
.pk-empty {
  font-size: 14px; color: var(--text-3);
  padding: 24px 14px; text-align: center; line-height: 1.7;
}
/* 选择器内新建账号 */
.pk-add {
  width: 100%; text-align: left;
  font-size: 14px; color: var(--brand); font-weight: 600;
  padding: 12px 14px; border-top: 1px solid var(--line);
}
.pk-add:active { background: var(--brand-light); }
.pk-new { padding: 10px 12px; border-top: 1px solid var(--line); }
.pk-inp {
  width: 100%; font-size: 14px; padding: 9px 10px;
  background: var(--bg); border-radius: 8px;
}
.pk-btns { display: flex; gap: 8px; margin-top: 8px; }
.pk-btn { flex: 1; font-size: 14px; padding: 8px 0; border-radius: 8px; background: var(--bg); color: var(--text-2); }
.pk-btn.ok { background: var(--brand); color: #fff; font-weight: 600; }

/* 记账模板弹层 */
.tpl-picker { max-height: 72%; }
.tpl-picker .pk-head { position: relative; font-weight: 600; color: var(--text); }
.tpl-x { position: absolute; right: 12px; top: 12px; font-size: 17px; color: var(--text-3); }
.tpl-body { flex: 1; overflow-y: auto; min-height: 120px; }
.tpl-empty {
  font-size: 14px; color: var(--text-3);
  text-align: center; line-height: 1.9; padding: 30px 14px;
}
.tpl-item {
  display: flex; align-items: stretch;
  border-bottom: 1px solid var(--line);
}
.tpl-main {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 6px 12px 14px; text-align: left;
}
.tpl-main:active { background: var(--bg); }
.tpl-ico {
  font-size: 22px; width: 34px; flex-shrink: 0; text-align: center;
}
.tpl-info { flex: 1; min-width: 0; }
.tpl-name {
  display: block; font-size: 15px; font-weight: 600; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tpl-desc {
  display: block; font-size: 13px; color: var(--text-3); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tpl-amt { font-size: 14px; color: var(--brand-dark); flex-shrink: 0; }
.tpl-del {
  width: 42px; flex-shrink: 0; font-size: 15px; color: var(--text-3);
}
.tpl-del:active { background: var(--bg); }
</style>
