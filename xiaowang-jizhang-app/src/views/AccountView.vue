<script setup>
import { ref, computed, nextTick } from 'vue'
import {
  accountGroups, accountBalances,
  addAccount, renameAccount, removeAccount,
  adjustBalance, accountBalanceOf, money
} from '../store/ledger.js'
import {
  exportAccountsJson, exportAccountsXlsx,
  parseAccountsFile, applyImport, pickFile
} from '../utils/accountIO.js'

const net = computed(() => accountBalances.value.reduce((a, b) => a + b.balance, 0))

const collapsed = ref({})      // groupId -> 是否折叠
const addingGroup = ref(null)  // 正在添加账号的 groupId
const newName = ref('')
const renamingId = ref(null)
const renameVal = ref('')

/* ---------- 余额调整 ---------- */
const adjId = ref(null)
const adjTarget = ref('')
const adjDate = ref('')
const adjNote = ref('')
const adjInput = ref(null)

const adjAccount = computed(() => accountBalances.value.find(a => a.id === adjId.value) || null)
const adjDelta = computed(() => {
  if (!adjAccount.value) return 0
  const to = parseFloat(adjTarget.value)
  if (isNaN(to)) return 0
  return Math.round((to - adjAccount.value.balance) * 100) / 100
})

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

/* 点击余额 → 打开调整弹层 */
function startAdjust(a) {
  adjId.value = a.id
  adjTarget.value = a.balance.toFixed(2)
  adjDate.value = new Date().toISOString().slice(0, 10)
  adjNote.value = ''
  nextTick(() => adjInput.value && adjInput.value.select())
}
function closeAdjust() { adjId.value = null }

function confirmAdjust() {
  const r = adjustBalance(adjId.value, adjTarget.value, adjDate.value, adjNote.value)
  if (!r) {
    alert(parseFloat(adjTarget.value) === adjAccount.value?.balance
      ? '新余额与当前余额相同，无需调整'
      : '请输入正确的余额数字')
    return
  }
  const sign = r.delta > 0 ? '+' : '-'
  alert(`已调整为 ¥${money(r.to)}，自动生成一笔「余额调整」流水：${sign}¥${money(Math.abs(r.delta))}`)
  closeAdjust()
}

/* ---------- 导入 / 导出 ---------- */
const importing = ref(false)
const impInfo = ref(null)   // { list, source }
const impErr = ref('')
const toastMsg = ref('')

function toast(msg) {
  toastMsg.value = msg
  setTimeout(() => { toastMsg.value = '' }, 2200)
}

function doExport(kind) {
  if (!accountBalances.value.length) {
    alert('还没有任何账户可导出，请先添加账号')
    return
  }
  try {
    const n = kind === 'json'
      ? exportAccountsJson(accountBalances.value)
      : exportAccountsXlsx(accountBalances.value)
    toast(`已导出 ${n} 个账号`)
  } catch (e) {
    alert('导出失败：' + e.message)
  }
}

async function doImport() {
  const file = await pickFile('.json,.xlsx,.xls')
  if (!file) return
  impErr.value = ''
  try {
    const { accounts, source } = await parseAccountsFile(file)
    if (!accounts.length) {
      impErr.value = '文件中没有可用的账号数据'
      return
    }
    impInfo.value = { list: accounts, source, name: file.name }
    importing.value = true
  } catch (e) {
    alert('导入失败：' + (e.message || '文件格式无法识别'))
  }
}

function confirmImport(mode) {
  const r = applyImport(impInfo.value.list, mode)
  importing.value = false
  impInfo.value = null
  toast(mode === 'replace'
    ? `已覆盖为 ${r.total} 个账号`
    : `已新增 ${r.added} 个账号${r.skipped ? `，跳过 ${r.skipped} 个重复` : ''}`)
}
</script>

<template>
  <div class="page">
    <div class="hero">
      <span class="lab">净资产</span>
      <span class="net amount-font">¥{{ money(net) }}</span>
      <span class="cnt">{{ accountBalances.length }} 个账号 · {{ accountGroups.length }} 类账户</span>
    </div>

    <!-- 账户信息导入 / 导出 -->
    <div class="io-bar">
      <button class="io" @click="doImport">📥 导入账户</button>
      <button class="io" @click="doExport('json')">📤 导出 JSON</button>
      <button class="io" @click="doExport('xlsx')">📊 导出 Excel</button>
    </div>

    <div class="section-title">我的账户</div>

    <!-- 全新安装：没有任何账号时的引导 -->
    <div v-if="!accountBalances.length" class="guide">
      <div class="gd-ico">🗂️</div>
      <p class="gd-t">还没有任何账户</p>
      <p class="gd-d">
        在下方任一账户类型里点「＋添加…账号」即可开始，<br />
        也可以从 JSON / Excel 批量导入
      </p>
    </div>

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
            <button class="a-bal amount-font" :class="{ neg: a.balance < 0 }" @click="startAdjust(a)">
              ¥{{ money(a.balance) }}
            </button>
            <button class="op" @click="startAdjust(a)" title="调整余额">⚖️</button>
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

    <p class="tip">
      点击余额可手动调整（自动生成一笔「余额调整」流水）<br />
      账户信息支持 JSON / Excel 导入导出
    </p>

    <!-- 余额调整弹层 -->
    <div v-if="adjId && adjAccount" class="mask" @click.self="closeAdjust">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">调整余额</span>
          <button class="sh-x" @click="closeAdjust">✕</button>
        </div>

        <div class="sh-body">
          <div class="row">
            <span class="rk">账号</span>
            <span class="rv">{{ adjAccount.name }}</span>
          </div>
          <div class="row">
            <span class="rk">当前余额</span>
            <span class="rv amount-font">¥{{ money(adjAccount.balance) }}</span>
          </div>

          <div class="row">
            <span class="rk">调整为</span>
            <input
              ref="adjInput" v-model="adjTarget" class="rv inp-num amount-font"
              type="number" inputmode="decimal" step="0.01" placeholder="0.00"
              @keyup.enter="confirmAdjust"
            />
          </div>

          <div class="row">
            <span class="rk">差额</span>
            <span class="rv delta amount-font" :class="adjDelta > 0 ? 'plus' : (adjDelta < 0 ? 'minus' : '')">
              {{ adjDelta > 0 ? '+' : '' }}{{ money(adjDelta) }}
            </span>
          </div>
          <p class="hint">
            差额 {{ adjDelta > 0 ? '记为「余额调整」收入' : (adjDelta < 0 ? '记为「余额调整」支出' : '为 0，无需调整') }}，
            使余额与流水保持一致
          </p>

          <div class="row">
            <span class="rk">日期</span>
            <input v-model="adjDate" class="rv inp-date" type="date" />
          </div>
          <div class="row">
            <span class="rk">备注</span>
            <input v-model="adjNote" class="rv inp-txt" type="text"
                   placeholder="留空则自动填写调整前后余额" maxlength="30" />
          </div>
        </div>

        <div class="sh-foot">
          <button class="sbtn" @click="closeAdjust">取消</button>
          <button class="sbtn ok" :disabled="!adjDelta" @click="confirmAdjust">确定调整</button>
        </div>
      </div>
    </div>

    <!-- 导入确认弹层 -->
    <div v-if="importing && impInfo" class="mask" @click.self="importing = false">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">导入账户</span>
          <button class="sh-x" @click="importing = false">✕</button>
        </div>
        <div class="sh-body">
          <p class="imp-sum">
            从 <b>{{ impInfo.source }}</b> 文件解析到 <b>{{ impInfo.list.length }}</b> 个账号
          </p>
          <div class="imp-preview">
            <span v-for="(a, i) in impInfo.list.slice(0, 12)" :key="i" class="chip">{{ a.name }}</span>
            <span v-if="impInfo.list.length > 12" class="chip more">…等 {{ impInfo.list.length }} 个</span>
          </div>
          <p class="hint">
            合并：保留现有账号，仅追加不重复的<br />
            覆盖：清空现有账号，替换为导入的账号（流水不受影响）
          </p>
        </div>
        <div class="sh-foot">
          <button class="sbtn" @click="importing = false">取消</button>
          <button class="sbtn ok" @click="confirmImport('merge')">合并导入</button>
          <button class="sbtn warn" @click="confirmImport('replace')">覆盖导入</button>
        </div>
      </div>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
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

/* 全新安装引导 */
.guide { text-align: center; padding: 22px 18px 26px; }
.gd-ico { font-size: 40px; margin-bottom: 10px; }
.gd-t { font-size: 14.5px; font-weight: 600; color: var(--text-1); margin-bottom: 6px; }
.gd-d { font-size: 12px; color: var(--text-3); line-height: 1.8; }

/* 导入导出按钮行 */
.io-bar {
  display: flex; gap: 8px; padding: 12px 14px 4px;
}
.io {
  flex: 1; font-size: 12px; padding: 9px 0; border-radius: 10px;
  background: #fff; color: var(--text-2);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
  white-space: nowrap;
}
.io:active { background: var(--bg); }

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
.acc { display: flex; align-items: center; gap: 5px; padding: 8px 0 8px 4px; border-bottom: 1px solid #F7F7F7; }
.acc:last-of-type { border-bottom: none; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--brand); flex-shrink: 0; }
.a-info { flex: 1; min-width: 0; }
.a-name { font-size: 13.5px; }
.a-sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }

/* 余额：可点击调整 */
.a-bal {
  font-size: 13.5px; font-weight: 600; flex-shrink: 0;
  padding: 4px 2px; border-bottom: 1px dashed var(--line);
}
.a-bal:active { opacity: .5; }
.a-bal.neg, .g-bal.neg { color: var(--expense); }

/* 编辑 / 删除：图标 18px，点击区 32×32 */
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

.tip { font-size: 11px; color: var(--text-3); text-align: center; padding: 14px 0; line-height: 1.8; }

/* ---------- 弹层 ---------- */
.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, .38);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; background: #fff; border-radius: 16px 16px 0 0;
  padding-bottom: var(--safe-bottom);
  animation: up .2s ease;
}
@keyframes up { from { transform: translateY(100%); } to { transform: translateY(0); } }

.sh-head {
  display: flex; align-items: center; justify-content: center;
  position: relative; padding: 14px 14px 10px;
  border-bottom: 1px solid var(--line);
}
.sh-title { font-size: 15px; font-weight: 600; }
.sh-x { position: absolute; right: 14px; font-size: 17px; color: var(--text-3); }

.sh-body { padding: 6px 16px 10px; }
.row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #F7F7F7; }
.rk { font-size: 13px; color: var(--text-3); width: 62px; flex-shrink: 0; }
.rv { flex: 1; font-size: 14px; text-align: right; min-width: 0; }
.inp-num {
  font-size: 20px; font-weight: 600; text-align: right;
  padding: 4px 0; background: transparent;
}
.inp-date, .inp-txt { font-size: 13px; text-align: right; padding: 4px 0; background: transparent; }

.delta { font-size: 15px; font-weight: 600; }
.delta.plus { color: var(--income); }
.delta.minus { color: var(--expense); }

.hint { font-size: 11px; color: var(--text-3); line-height: 1.7; padding: 10px 0 4px; }

.sh-foot {
  display: flex; gap: 10px; padding: 10px 16px 14px;
  border-top: 1px solid var(--line);
}
.sbtn {
  flex: 1; padding: 12px 0; border-radius: 12px;
  font-size: 14px; background: var(--bg); color: var(--text-2);
}
.sbtn.ok { background: var(--brand); color: #fff; font-weight: 600; }
.sbtn.warn { background: #FFF1E8; color: #FF6B00; font-weight: 600; }
.sbtn:disabled { opacity: .45; }

/* 导入预览 */
.imp-sum { font-size: 13px; color: var(--text-2); padding: 12px 0 8px; }
.imp-preview { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 6px; }
.chip {
  font-size: 11.5px; padding: 4px 9px; border-radius: 12px;
  background: var(--bg); color: var(--text-2);
}
.chip.more { color: var(--text-3); }

.toast {
  position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%);
  background: rgba(0, 0, 0, .78); color: #fff;
  font-size: 13px; padding: 9px 18px; border-radius: 20px;
  z-index: 300; animation: fade .18s ease;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
</style>
