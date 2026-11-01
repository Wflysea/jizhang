<script setup>
import { ref, computed } from 'vue'
import {
  accountGroups, accountBalances,
  addAccount, renameAccount, removeAccount
} from '../store/ledger.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const net = computed(() => accountBalances.value.reduce((a, b) => a + b.balance, 0))

const collapsed = ref({})      // groupId -> 是否折叠
const addingGroup = ref(null)  // 正在添加账号的 groupId
const newName = ref('')
const renamingId = ref(null)
const renameVal = ref('')

function toggle(gid) { collapsed.value[gid] = !collapsed.value[gid] }

function startAdd(gid) { addingGroup.value = gid; newName.value = '' }
function cancelAdd() { addingGroup.value = null; newName.value = '' }
function confirmAdd(gid) {
  if (addAccount(gid, newName.value)) cancelAdd()
}

function startRename(a) { renamingId.value = a.id; renameVal.value = a.name }
function cancelRename() { renamingId.value = null; renameVal.value = '' }
function confirmRename() {
  renameAccount(renamingId.value, renameVal.value)
  cancelRename()
}

function del(a) {
  const msg = a.count
    ? `「${a.name}」下有 ${a.count} 笔流水。删除账号后流水会保留，但归属将显示为「已删除账号」。确定删除？`
    : `确定删除账号「${a.name}」？`
  if (confirm(msg)) removeAccount(a.id)
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <span class="lab">净资产</span>
      <span class="net amount-font">¥{{ money(net) }}</span>
      <span class="cnt">{{ accountBalances.length }} 个账号 · {{ accountGroups.length }} 类账户</span>
    </div>

    <div class="section-title">我的账户</div>

    <div v-for="g in accountGroups" :key="g.id" class="card group">
      <!-- 一级：账户类型 -->
      <div class="g-head" @click="toggle(g.id)">
        <span class="g-ico">{{ g.icon }}</span>
        <div class="g-info">
          <div class="g-name">{{ g.name }}</div>
          <div class="g-sub">{{ g.items.length }} 个账号</div>
        </div>
        <span class="g-bal amount-font" :class="{ neg: g.balance < 0 }">¥{{ money(g.balance) }}</span>
        <span class="arrow" :class="{ up: !collapsed[g.id] }">›</span>
      </div>

      <!-- 二级：具体账号 -->
      <div v-show="!collapsed[g.id]" class="g-body">
        <div v-for="a in g.items" :key="a.id" class="acc">
          <span class="dot"></span>

          <div v-if="renamingId === a.id" class="edit-row">
            <input v-model="renameVal" class="inp" placeholder="账号名称" maxlength="16"
                   @keyup.enter="confirmRename" />
            <button class="btn ok" @click="confirmRename">保存</button>
            <button class="btn" @click="cancelRename">取消</button>
          </div>

          <template v-else>
            <div class="a-info">
              <div class="a-name">{{ a.name }}</div>
              <div class="a-sub">{{ a.count }} 笔</div>
            </div>
            <span class="a-bal amount-font" :class="{ neg: a.balance < 0 }">¥{{ money(a.balance) }}</span>
            <button class="op" @click="startRename(a)">✎</button>
            <button class="op danger" @click="del(a)">✕</button>
          </template>
        </div>

        <p v-if="!g.items.length" class="none">该类型下还没有账号</p>

        <!-- 添加账号 -->
        <div v-if="addingGroup === g.id" class="edit-row add-row">
          <input v-model="newName" class="inp" placeholder="如：招行储蓄卡" maxlength="16"
                 @keyup.enter="confirmAdd(g.id)" />
          <button class="btn ok" @click="confirmAdd(g.id)">添加</button>
          <button class="btn" @click="cancelAdd">取消</button>
        </div>
        <button v-else class="add-btn" @click="startAdd(g.id)">＋ 添加{{ g.name }}账号</button>
      </div>
    </div>

    <p class="tip">余额由流水自动汇总；一级为账户类型，二级为可自定义的具体账号</p>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(20px + var(--safe-top)) 18px 22px;
  display: flex; flex-direction: column; gap: 4px;
}
.lab { font-size: 12px; opacity: .85; }
.net { font-size: 28px; font-weight: 600; }
.cnt { font-size: 11px; opacity: .8; }

.group { padding: 0 14px; }
.g-head { display: flex; align-items: center; gap: 10px; padding: 12px 0; }
.g-ico { font-size: 22px; width: 26px; text-align: center; }
.g-info { flex: 1; }
.g-name { font-size: 14.5px; font-weight: 600; }
.g-sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.g-bal { font-size: 15px; font-weight: 600; }
.arrow { color: var(--text-3); font-size: 17px; transition: .2s; }
.arrow.up { transform: rotate(90deg); }

.g-body { border-top: 1px solid var(--line); padding-bottom: 6px; }
.acc { display: flex; align-items: center; gap: 6px; padding: 8px 0 8px 4px; border-bottom: 1px solid #F7F7F7; }
.acc:last-of-type { border-bottom: none; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--brand); flex-shrink: 0; }
.a-info { flex: 1; min-width: 0; }
.a-name { font-size: 13.5px; }
.a-sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.a-bal { font-size: 13.5px; font-weight: 600; }
.a-bal.neg, .g-bal.neg { color: var(--expense); }

/* 编辑 / 删除：图标放大到 18px，点击区 32×32 */
.op {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-2);
  border-radius: 9px; background: var(--bg);
}
.op.danger { color: var(--expense); }
.op:active { opacity: .55; transform: scale(.94); }

.none { font-size: 12px; color: var(--text-3); padding: 10px 0 10px 4px; }

.edit-row { display: flex; align-items: center; gap: 6px; flex: 1; }
.add-row { padding: 10px 0 8px 4px; }
.inp {
  flex: 1; min-width: 0; font-size: 13px; padding: 7px 10px;
  background: var(--bg); border-radius: 8px;
}
.btn { font-size: 12px; padding: 7px 12px; border-radius: 8px; background: var(--bg); color: var(--text-2); }
.btn.ok { background: var(--brand); color: #fff; font-weight: 600; }

.add-btn {
  width: 100%; text-align: left; font-size: 12.5px; color: var(--brand);
  padding: 10px 0 8px 4px;
}
.add-btn:active { opacity: .6; }

.tip { font-size: 11px; color: var(--text-3); text-align: center; padding: 14px 0; }
</style>
