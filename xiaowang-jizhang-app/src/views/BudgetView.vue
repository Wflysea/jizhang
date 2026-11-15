<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import {
  state, budgetUsage, addBudget, updateBudget, removeBudget, getBudget
} from '../store/ledger.js'
import { EXPENSE_CATEGORIES } from '../data/categories.js'
import { registerBack } from '../utils/back.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/* 可设预算的分类（排除「余额调整」「期初余额」这类内部特殊分类） */
const CATS = EXPENSE_CATEGORIES.filter(c => !['adjust_e', 'carryover_e'].includes(c.id))

const usage = computed(() => budgetUsage.value)

/* ---------- 新增 / 编辑 弹层 ---------- */
const showForm = ref(false)
const editingId = ref(null)            // null = 新增
const form = reactive({ type: 'total', categoryId: '', amount: '' })
const formErr = ref('')

function openAdd() {
  editingId.value = null
  form.type = 'total'
  form.categoryId = ''
  form.amount = ''
  formErr.value = ''
  showForm.value = true
}

function openEdit(b) {
  editingId.value = b.id
  form.type = b.categoryId === null ? 'total' : 'category'
  form.categoryId = b.categoryId === null ? '' : b.categoryId
  form.amount = String(b.amount)
  formErr.value = ''
  showForm.value = true
}

function pickType(t) {
  form.type = t
  if (t === 'total') form.categoryId = ''
}

function pickCat(c) { form.categoryId = c.id }

function saveForm() {
  const amt = parseFloat(form.amount)
  if (!amt || amt <= 0) { formErr.value = '请输入大于 0 的预算金额'; return }
  if (form.type === 'category' && !form.categoryId) { formErr.value = '请选择一个分类'; return }

  const catId = form.type === 'total' ? null : form.categoryId
  // 避免同一维度重复设置预算
  const exist = getBudget(catId)
  if (exist && exist.id !== editingId.value) {
    formErr.value = form.type === 'total' ? '总预算已存在，请直接编辑' : '该分类已有预算，请直接编辑'
    return
  }

  if (editingId.value) updateBudget(editingId.value, { amount: amt, categoryId: catId })
  else addBudget({ categoryId: catId, amount: amt })
  showForm.value = false
}

function del(b) {
  if (confirm(`确定删除${b.categoryId === null ? '总预算' : '「' + b.name + '」分类预算'}？`)) removeBudget(b.id)
}

function closeForm() { showForm.value = false }

/* ---------- 返回键：先关弹层，再关页面 ---------- */
let unreg = null
onMounted(() => {
  unreg = registerBack(() => {
    if (showForm.value) { showForm.value = false; return true }
    if (state.budgetOpen) { state.budgetOpen = false; return true }
    return false
  })
})
onUnmounted(() => { if (unreg) unreg() })
</script>

<template>
  <div class="page budget-page">
    <!-- 顶部栏 -->
    <header class="topbar">
      <button class="back" @click="state.budgetOpen = false">‹</button>
      <h1>预算管理</h1>
      <button class="add" @click="openAdd">＋</button>
    </header>

    <p class="intro">预算按「自然月」设置，作用于每个月；下方按当前查看的 <b>{{ state.month.replace('-', '年') }}月</b> 统计实际支出。</p>

    <!-- 总预算卡片 -->
    <div v-if="usage.total" class="card total-card">
      <div class="tc-top">
        <span class="tc-name">📊 本月总预算</span>
        <span class="tc-budget amount-font">¥{{ money(usage.total.budget) }}</span>
      </div>
      <div class="bar">
        <i :class="{ over: usage.total.over }" :style="{ width: (usage.total.percent * 100) + '%' }"></i>
      </div>
      <div class="tc-bot">
        <span>已花 <b class="amount-font">¥{{ money(usage.total.spent) }}</b></span>
        <span :class="usage.total.over ? 'over' : ''">
          {{ usage.total.over ? '超支' : '剩余' }}
          <b class="amount-font">¥{{ money(Math.abs(usage.total.remain)) }}</b>
        </span>
      </div>
    </div>

    <!-- 分类预算列表 -->
    <div v-if="usage.categories.length" class="section-title">分类预算（本月）</div>
    <div v-for="b in usage.categories" :key="b.id" class="card bgt">
      <div class="bgt-top">
        <span class="bgt-name">{{ b.icon }} {{ b.name }}</span>
        <span class="bgt-amt amount-font">¥{{ money(b.budget) }}</span>
      </div>
      <div class="bar">
        <i :class="{ over: b.over }" :style="{ width: (b.percent * 100) + '%', background: b.over ? 'var(--expense)' : b.color }"></i>
      </div>
      <div class="bgt-bot">
        <span>已花 <b class="amount-font">¥{{ money(b.spent) }}</b>（{{ (b.percent * 100).toFixed(0) }}%）</span>
        <span :class="b.over ? 'over' : ''">
          {{ b.over ? '超支' : '剩余' }} <b class="amount-font">¥{{ money(Math.abs(b.remain)) }}</b>
        </span>
      </div>
      <div class="bgt-acts">
        <button @click="openEdit(b)">编辑</button>
        <button class="del" @click="del(b)">删除</button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!usage.total && !usage.categories.length" class="empty">
      <div class="e-ico">📊</div>
      <p>还没有设置预算</p>
      <p class="e-sub">点右上角「＋」添加总预算或分类预算，<br />帮自己掌控每月开支</p>
      <button class="e-btn" @click="openAdd">添加预算</button>
    </div>

    <!-- 新增 / 编辑 弹层 -->
    <div v-if="showForm" class="mask" @click.self="closeForm">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">{{ editingId ? '编辑预算' : '添加预算' }}</span>
          <button class="sh-x" @click="closeForm">✕</button>
        </div>

        <div class="sh-body">
          <div class="type-switch">
            <button :class="{ on: form.type === 'total' }" @click="pickType('total')">总预算</button>
            <button :class="{ on: form.type === 'category' }" @click="pickType('category')">分类预算</button>
          </div>

          <div v-if="form.type === 'category'" class="cat-grid">
            <button
              v-for="c in CATS" :key="c.id"
              class="cat" :class="{ on: form.categoryId === c.id }"
              @click="pickCat(c)"
            >{{ c.icon }} {{ c.name }}</button>
          </div>

          <div class="amt-field">
            <span class="yuan">¥</span>
            <input
              v-model="form.amount" type="number" inputmode="decimal" min="0" step="0.01"
              placeholder="每月预算金额" @keyup.enter="saveForm"
            />
          </div>
          <p v-if="formErr" class="form-err">{{ formErr }}</p>
          <p class="hint">预算金额对所有月份共用，本月实际支出可在此页实时查看。</p>
        </div>

        <div class="sh-foot">
          <button class="sbtn" @click="closeForm">取消</button>
          <button class="sbtn ok" @click="saveForm">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.budget-page { background: var(--bg); }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: calc(14px + var(--safe-top)) 12px 12px;
  border-bottom: 1px solid var(--line);
}
.topbar h1 { font-size: 17px; font-weight: 600; }
.topbar .back { font-size: 26px; color: var(--text-2); width: 32px; }
.topbar .add { font-size: 22px; color: var(--brand); width: 32px; font-weight: 300; }

.intro { font-size: 13px; color: var(--text-3); padding: 12px 16px 4px; line-height: 1.6; }
.intro b { color: var(--text-2); }

/* 总预算卡片 */
.total-card { padding: 16px; }
.tc-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.tc-name { font-size: 15px; font-weight: 600; }
.tc-budget { font-size: 16px; font-weight: 600; }

.bar { height: 8px; background: #F2F3F5; border-radius: 4px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; background: var(--brand); transition: width .35s ease; }
.bar i.over { background: var(--expense); }

.tc-bot { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-2); margin-top: 8px; }
.tc-bot .over, .bgt-bot .over { color: var(--expense); }

/* 分类预算卡片 */
.bgt { padding: 14px; }
.bgt-top { display: flex; justify-content: space-between; align-items: baseline; }
.bgt-name { font-size: 15px; font-weight: 600; }
.bgt-amt { font-size: 15px; font-weight: 600; }
.bgt-bot { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-2); margin-top: 8px; }
.bgt-acts { display: flex; justify-content: flex-end; gap: 16px; margin-top: 8px; }
.bgt-acts button { font-size: 14px; color: var(--brand); }
.bgt-acts .del { color: var(--expense); }

/* 空状态 */
.empty { text-align: center; padding: 50px 0 30px; }
.e-ico { font-size: 48px; opacity: .5; }
.empty p { font-size: 16px; font-weight: 600; margin-top: 10px; }
.e-sub { font-size: 13px; color: var(--text-3); font-weight: 400; line-height: 1.7; margin-top: 6px; }
.e-btn {
  margin-top: 18px; padding: 10px 30px; border-radius: 22px;
  background: var(--brand); color: #fff; font-size: 15px; font-weight: 600;
}

/* 弹层 */
.mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0, 0, 0, .38);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; background: #fff; border-radius: 16px 16px 0 0;
  padding-bottom: var(--safe-bottom); animation: up .2s ease;
}
@keyframes up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.sh-head {
  display: flex; align-items: center; justify-content: center;
  position: relative; padding: 14px 14px 10px; border-bottom: 1px solid var(--line);
}
.sh-title { font-size: 16px; font-weight: 600; }
.sh-x { position: absolute; right: 14px; font-size: 17px; color: var(--text-3); }

.sh-body { padding: 10px 16px; }
.type-switch { display: flex; background: var(--bg); border-radius: 12px; padding: 3px; margin-bottom: 14px; }
.type-switch button { flex: 1; padding: 9px 0; border-radius: 10px; font-size: 15px; color: var(--text-2); }
.type-switch button.on { background: #fff; color: var(--brand-dark); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }

.cat-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.cat {
  font-size: 13.5px; padding: 8px 12px; border-radius: 14px;
  background: var(--bg); color: var(--text-2);
}
.cat.on { background: var(--brand-light); color: var(--brand-dark); font-weight: 600; }

.amt-field {
  display: flex; align-items: center; gap: 6px;
  border-bottom: 1px solid var(--line); padding: 8px 2px;
}
.amt-field .yuan { font-size: 22px; font-weight: 600; color: var(--text); }
.amt-field input { flex: 1; font-size: 22px; font-weight: 600; }
.amt-field input::placeholder { font-size: 15px; font-weight: 400; color: var(--text-3); }

.form-err { font-size: 13px; color: var(--expense); margin-top: 8px; }
.hint { font-size: 13px; color: var(--text-3); line-height: 1.7; padding: 8px 0 4px; }

.sh-foot {
  display: flex; gap: 10px; padding: 10px 16px 14px; border-top: 1px solid var(--line);
}
.sbtn {
  flex: 1; padding: 12px 0; border-radius: 12px;
  font-size: 15px; background: var(--bg); color: var(--text-2);
}
.sbtn.ok { background: var(--brand); color: #fff; font-weight: 600; }
</style>
