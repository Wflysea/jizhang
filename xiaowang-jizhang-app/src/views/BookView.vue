<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import {
  state, addBook, switchBook, renameBook, removeBook,
  activeBookName, bookRecordCount
} from '../store/ledger.js'
import { registerBack } from '../utils/back.js'

/* ---------- 新增 / 重命名 弹层 ---------- */
const showForm = ref(false)
const editingId = ref(null)          // null = 新增
const form = reactive({ name: '' })
const formErr = ref('')

function openAdd() {
  editingId.value = null
  form.name = ''
  formErr.value = ''
  showForm.value = true
}

function openEdit(b) {
  editingId.value = b.id
  form.name = b.name
  formErr.value = ''
  showForm.value = true
}

function closeForm() { showForm.value = false }

function saveForm() {
  const name = String(form.name || '').trim()
  if (!name) { formErr.value = '请输入账本名称'; return }
  if (name.length > 16) { formErr.value = '名称最多 16 个字'; return }
  if (editingId.value) {
    renameBook(editingId.value, name)
  } else {
    addBook(name)
  }
  showForm.value = false
}

/* ---------- 切换 / 删除 ---------- */
function pick(b) {
  if (b.id === state.activeBookId) return
  switchBook(b.id)
  state.bookOpen = false
}

function del(b) {
  if (state.books.length <= 1) { alert('至少要保留一个账本'); return }
  if (confirm(`确定删除账本「${b.name}」？该账本下的流水、账户、预算和模板将一并删除，且不可恢复。`)) {
    removeBook(b.id)
  }
}

/* ---------- 返回键：先关弹层，再关页面 ---------- */
let unreg = null
onMounted(() => {
  unreg = registerBack(() => {
    if (showForm.value) { showForm.value = false; return true }
    if (state.bookOpen) { state.bookOpen = false; return true }
    return false
  })
})
onUnmounted(() => { if (unreg) unreg() })
</script>

<template>
  <div class="page book-page">
    <!-- 顶部栏 -->
    <header class="topbar">
      <button class="back" @click="state.bookOpen = false">‹</button>
      <h1>账本管理</h1>
      <button class="add" @click="openAdd">＋</button>
    </header>

    <p class="intro">每个账本的流水、账户、预算与模板互相独立。点击账本即可切换，长按或点右侧按钮可改名、删除。</p>

    <!-- 账本列表 -->
    <div class="section-title">我的账本（{{ state.books.length }}）</div>
    <div v-for="b in state.books" :key="b.id"
         class="card book" :class="{ active: b.id === state.activeBookId }"
         @click="pick(b)">
      <span class="bk-ico">{{ b.id === state.activeBookId ? '📗' : '📘' }}</span>
      <div class="bk-mid">
        <div class="bk-name">
          {{ b.name }}
          <span v-if="b.id === state.activeBookId" class="cur">当前</span>
        </div>
        <div class="bk-sub">{{ bookRecordCount(b.id) }} 笔流水</div>
      </div>
      <button class="bk-edit" @click.stop="openEdit(b)">改名</button>
      <button class="bk-del" :disabled="state.books.length <= 1" @click.stop="del(b)">删除</button>
    </div>

    <button class="new-book" @click="openAdd">＋ 新建账本</button>

    <p class="tip">切换账本时数据自动保存在本机，互不影响；<br />备份导出只包含当前账本，换设备请先分别导出。</p>

    <!-- 新增 / 重命名 弹层 -->
    <div v-if="showForm" class="mask" @click.self="closeForm">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">{{ editingId ? '重命名账本' : '新建账本' }}</span>
          <button class="sh-x" @click="closeForm">✕</button>
        </div>

        <div class="sh-body">
          <div class="name-field">
            <input v-model="form.name" maxlength="16" placeholder="给账本起个名字"
                   @keyup.enter="saveForm" />
          </div>
          <p v-if="formErr" class="form-err">{{ formErr }}</p>
          <p class="hint">名称最多 16 个字，例如「日常」「旅行」「家庭」。</p>
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
.book-page { background: var(--bg); }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: calc(14px + var(--safe-top)) 12px 12px;
  border-bottom: 1px solid var(--line);
}
.topbar h1 { font-size: 17px; font-weight: 600; }
.topbar .back { font-size: 26px; color: var(--text-2); width: 32px; }
.topbar .add { font-size: 22px; color: var(--brand); width: 32px; font-weight: 300; }

.intro { font-size: 13px; color: var(--text-3); padding: 12px 16px 4px; line-height: 1.6; }
.section-title { font-size: 13px; color: var(--text-3); padding: 14px 16px 6px; }

.card.book {
  display: flex; align-items: center; gap: 10px;
  margin: 0 12px 10px; padding: 14px;
  background: #fff; border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .04);
  border: 1px solid transparent;
}
.card.book.active { border-color: var(--brand); background: var(--brand-light); }
.card.book:active { opacity: .8; }
.bk-ico {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: var(--bg); display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.bk-mid { flex: 1; min-width: 0; }
.bk-name { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.bk-name .cur {
  font-size: 11px; font-weight: 400; color: var(--brand-dark);
  background: #fff; border-radius: 8px; padding: 1px 7px;
}
.bk-sub { font-size: 12px; color: var(--text-3); margin-top: 3px; }
.bk-edit, .bk-del {
  flex-shrink: 0; font-size: 13px; padding: 6px 8px; border-radius: 8px;
}
.bk-edit { color: var(--brand); }
.bk-del { color: var(--expense); }
.bk-del:disabled { color: var(--text-3); opacity: .5; }

.new-book {
  display: block; width: calc(100% - 24px); margin: 6px 12px 14px;
  padding: 13px 0; border-radius: 12px; border: 1px dashed var(--brand);
  color: var(--brand-dark); font-size: 15px; font-weight: 600; background: #fff;
}
.new-book:active { background: var(--brand-light); }

.tip { text-align: center; font-size: 12px; color: var(--text-3); padding: 4px 16px 20px; line-height: 1.7; }

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
.sh-body { padding: 14px 16px; }
.name-field { border-bottom: 1px solid var(--line); padding: 8px 2px; }
.name-field input { width: 100%; font-size: 18px; font-weight: 600; }
.name-field input::placeholder { font-size: 15px; font-weight: 400; color: var(--text-3); }
.form-err { font-size: 13px; color: var(--expense); margin-top: 8px; }
.hint { font-size: 13px; color: var(--text-3); line-height: 1.7; padding: 10px 0 4px; }
.sh-foot { display: flex; gap: 10px; padding: 10px 16px 14px; border-top: 1px solid var(--line); }
.sbtn { flex: 1; padding: 12px 0; border-radius: 12px; font-size: 15px; background: var(--bg); color: var(--text-2); }
.sbtn.ok { background: var(--brand); color: #fff; font-weight: 600; }
</style>
