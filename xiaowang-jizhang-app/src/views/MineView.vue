<script setup>
import { ref, computed } from 'vue'
import {
  state, clearAll, transferText, accountBalances,
  storageUsage, formatBytes
} from '../store/ledger.js'
import { getCategory } from '../data/categories.js'
import {
  exportBackupXlsx, parseImportFile, applyImport, pickFile
} from '../utils/dataIO.js'
import { exportToast } from '../utils/fileExport.js'
import pkg from '../../package.json'

/* ---------- 导出 ---------- */
const busy = ref('')

/** 明细流水行（转账写成「转出 → 转入」） */
function detailRow(r) {
  return {
    '日期': r.date,
    '类型': r.type === 'transfer' ? '转账' : (r.type === 'income' ? '收入' : '支出'),
    '分类': r.type === 'transfer' ? '转账' : getCategory(r.type, r.categoryId).name,
    '金额': r.amount,
    '账户': transferText(r),
    '备注': r.note || ''
  }
}

/** 分类汇总（转账、余额调整不计入收支） */
function byCategory() {
  const map = new Map()
  for (const r of state.records) {
    if (r.adjust) continue
    if (r.type === 'transfer') continue
    const type = r.type === 'income' ? '收入' : '支出'
    const name = getCategory(r.type, r.categoryId).name
    const key = `${type}-${name}`
    if (!map.has(key)) map.set(key, { '类型': type, '分类': name, '金额': 0, '笔数': 0 })
    const it = map.get(key)
    it['金额'] = Math.round((it['金额'] + r.amount) * 100) / 100
    it['笔数'] += 1
  }
  return [...map.values()].sort((a, b) => b['金额'] - a['金额'])
}

/** 月度汇总（不含余额调整、转账） */
function byMonth() {
  const map = new Map()
  for (const r of state.records) {
    if (r.adjust) continue
    if (r.type === 'transfer') continue
    const m = r.date.slice(0, 7)
    if (!map.has(m)) map.set(m, { '月份': m, '收入': 0, '支出': 0, '结余': 0 })
    const it = map.get(m)
    if (r.type === 'income') it['收入'] += r.amount
    else it['支出'] += r.amount
  }
  return [...map.values()]
    .map(m => { m['结余'] = Math.round((m['收入'] - m['支出']) * 100) / 100; return m })
    .sort((a, b) => (a['月份'] < b['月份'] ? 1 : -1))
}

async function doExport(kind) {
  if (!state.records.length && !state.accounts.length && !state.templates.length) {
    alert('还没有任何数据可导出')
    return
  }
  busy.value = 'xlsx'
  try {
    const r = exportBackupXlsx(accountBalances.value, { detailRow, byCategory, byMonth })
    const res = await r.file
    alert(exportToast(res, r.name))
  } catch (e) {
    alert('导出失败：' + (e.message || e))
  } finally {
    busy.value = ''
  }
}

/* ---------- 导入 ---------- */
const importing = ref(false)
const impInfo = ref(null)   // { kind, source, accounts, records, name }
const impErr = ref('')

async function doImport() {
  const file = await pickFile()
  if (!file) return
  impErr.value = ''
  try {
    const data = await parseImportFile(file)
    impInfo.value = { ...data, name: file.name }
    importing.value = true
  } catch (e) {
    impErr.value = e.message || '文件格式无法识别'
    alert('导入失败：' + impErr.value)
  }
}

function confirmImport(mode) {
  const d = impInfo.value
  if (!d) return
  const r = applyImport(d, mode)
  importing.value = false
  impInfo.value = null
  const tplText = mode === 'replace'
    ? `、${r.addedTemplates} 个模板`
    : `、${r.addedTemplates} 个模板${r.skippedTemplates ? `（跳过 ${r.skippedTemplates} 个重复）` : ''}`
  alert(mode === 'replace'
    ? `已覆盖导入：${r.addedAccounts} 个账号、${r.addedRecords} 笔流水${tplText}`
    : `已合并导入：新增 ${r.addedAccounts} 个账号${r.skippedAccounts ? `（跳过 ${r.skippedAccounts} 个重复）` : ''}、${r.addedRecords} 笔流水${r.skippedRecords ? `（跳过 ${r.skippedRecords} 笔重复）` : ''}${tplText}` +
      (r.createdAccounts ? `；流水引用了未知账户，已自动新建 ${r.createdAccounts} 个` : ''))
}

const impSummary = computed(() => {
  const d = impInfo.value
  if (!d) return ''
  const parts = []
  if (d.accounts.length) parts.push(`${d.accounts.length} 个账号`)
  if (d.records.length) parts.push(`${d.records.length} 笔流水`)
  if (d.templates && d.templates.length) parts.push(`${d.templates.length} 个模板`)
  return parts.join('、')
})

function reset() {
  if (confirm('确定清空全部账目？此操作不可恢复。')) clearAll()
}

/* ---------- 存储空间 ---------- */
const showStorage = ref(false)
</script>

<template>
  <div class="page">
    <div class="hero">
      <div class="avatar">记</div>
      <div class="who">
        <div class="name">我的账本</div>
        <div class="cnt">
          共 {{ state.records.length }} 笔记录 · {{ state.accounts.length }} 个账号 · {{ state.templates.length }} 个模板
        </div>
      </div>
    </div>

    <div class="section-title">数据导入导出</div>
    <div class="card list">
      <button class="li" :disabled="busy === 'xlsx'" @click="doExport()">
        <span class="li-ico">📊</span>
        <span class="li-txt">
          导出 Excel
          <em class="li-sub">明细流水 + 账户 + 模板 + 分类/月度汇总</em>
        </span>
        <span class="arrow">›</span>
      </button>
      <button class="li" @click="doImport">
        <span class="li-ico">📥</span>
        <span class="li-txt">
          导入 Excel
          <em class="li-sub">自动识别账户表与流水表</em>
        </span>
        <span class="arrow">›</span>
      </button>
    </div>

    <p class="tip">
      导出走系统分享面板（可保存到本地、发微信、传网盘）<br />
      记账模板随 Excel 一起备份，换机或覆盖导入后仍可使用<br />
      导入支持「合并」（保留现有数据，跳过重复）与「覆盖」（替换为文件内容）<br />
      导出的 Excel 可直接改完再导回，无需另存备份文件<br />
      记账时添加的「凭证图片」仅保存在本机，不随 Excel 导出，换机前请先备份
    </p>

    <div class="section-title">数据管理</div>
    <div class="card list">
      <button class="li" @click="reset">
        <span class="li-ico">🗑️</span>
        <span class="li-txt danger">清空全部数据</span>
        <span class="arrow">›</span>
      </button>
    </div>

    <div class="section-title">设置</div>
    <div class="card list">
      <div class="li" @click="showStorage = true">
        <span class="li-ico">💾</span>
        <span class="li-txt">存储空间</span>
        <span class="val">{{ formatBytes(storageUsage.total) }}</span>
        <span class="arrow">›</span>
      </div>
      <div class="li"><span class="li-ico">💰</span><span class="li-txt">预算管理</span><span class="arrow">›</span></div>
      <div class="li"><span class="li-ico">🏷️</span><span class="li-txt">分类管理</span><span class="arrow">›</span></div>
    </div>

    <p class="ver">小王记账 v{{ pkg.version }} · Vue3 + Capacitor</p>

    <!-- 导入确认弹层 -->
    <div v-if="importing && impInfo" class="mask" @click.self="importing = false">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">导入数据</span>
          <button class="sh-x" @click="importing = false">✕</button>
        </div>

        <div class="sh-body">
          <p class="imp-sum">
            从 <b>{{ impInfo.source }}</b> 文件「{{ impInfo.name }}」解析到
          </p>
          <div class="imp-nums">
            <span v-if="impInfo.accounts.length" class="num">账号 <b>{{ impInfo.accounts.length }}</b></span>
            <span v-if="impInfo.records.length" class="num">流水 <b>{{ impInfo.records.length }}</b></span>
            <span v-if="impInfo.templates && impInfo.templates.length" class="num">模板 <b>{{ impInfo.templates.length }}</b></span>
          </div>

          <div v-if="impInfo.accounts.length" class="imp-preview">
            <span v-for="(a, i) in impInfo.accounts.slice(0, 8)" :key="i" class="chip">
              {{ a.name }}<i v-if="a.excluded">·不计入</i>
            </span>
            <span v-if="impInfo.accounts.length > 8" class="chip more">…等 {{ impInfo.accounts.length }} 个</span>
          </div>

          <p class="hint">
            合并：保留现有数据，仅追加不重复的账号与流水<br />
            覆盖：清空现有账号与流水，替换为文件内容
          </p>
        </div>

        <div class="sh-foot">
          <button class="sbtn" @click="importing = false">取消</button>
          <button class="sbtn ok" @click="confirmImport('merge')">合并导入</button>
          <button class="sbtn warn" @click="confirmImport('replace')">覆盖导入</button>
        </div>
      </div>
    </div>

    <!-- 存储空间明细弹层 -->
    <div v-if="showStorage" class="mask" @click.self="showStorage = false">
      <div class="sheet">
        <div class="sh-head">
          <span class="sh-title">存储空间</span>
          <button class="sh-x" @click="showStorage = false">✕</button>
        </div>

        <div class="sh-body">
          <div v-for="it in storageUsage.items" :key="it.key" class="sto-row">
            <span class="sto-name">{{ it.name }}</span>
            <span class="sto-val">{{ formatBytes(it.bytes) }}</span>
          </div>
          <p class="hint">
            共 {{ state.records.length }} 笔账目 · {{ state.accounts.length }} 个账户 · {{ state.templates.length }} 个模板<br />
            其中凭证图片 {{ storageUsage.imageCount }} 张，约 {{ formatBytes(storageUsage.imageBytes) }}<br />
            数据保存在本机（localStorage），清空账目或更换设备前请先导出备份
          </p>
        </div>

        <div class="sh-foot">
          <button class="sbtn" @click="showStorage = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, #FFB400, #FF8A00);
  color: #fff;
  padding: calc(24px + var(--safe-top)) 18px 22px;
  display: flex; align-items: center; gap: 12px;
}
.avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(255,255,255,.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 600;
}
.name { font-size: 17px; font-weight: 600; }
.cnt { font-size: 13px; opacity: .85; margin-top: 3px; }

.list { padding: 0 14px; }
.li {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 12px 0; border-bottom: 1px solid #F7F7F7; text-align: left;
}
.li:last-child { border-bottom: none; }
.li:active { opacity: .6; }
.li:disabled { opacity: .5; }
.li-ico { font-size: 17px; width: 24px; text-align: center; flex-shrink: 0; }
.li-txt { flex: 1; font-size: 15px; }
.li-txt.danger { color: var(--expense); }
.li-sub {
  display: block; font-style: normal;
  font-size: 13px; color: var(--text-3); margin-top: 3px;
}
.arrow { color: var(--text-3); font-size: 17px; flex-shrink: 0; }
.li .val { font-size: 14px; color: var(--text-3); margin-right: 2px; flex-shrink: 0; font-variant-numeric: tabular-nums; }

.tip {
  font-size: 13px; color: var(--text-3);
  padding: 10px 18px 0; line-height: 1.8;
}

.ver { text-align: center; font-size: 13px; color: var(--text-3); padding: 20px 0; }

/* ---------- 导入弹层 ---------- */
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
.sh-title { font-size: 16px; font-weight: 600; }
.sh-x { position: absolute; right: 14px; font-size: 17px; color: var(--text-3); }

.sh-body { padding: 6px 16px 10px; }
.imp-sum { font-size: 14px; color: var(--text-2); padding: 12px 0 6px; line-height: 1.6; }
.imp-nums { display: flex; gap: 10px; padding-bottom: 10px; }
.num {
  font-size: 14px; color: var(--text-2);
  background: var(--bg); border-radius: 10px; padding: 6px 12px;
}
.num b { color: var(--brand-dark); font-size: 15px; margin-left: 3px; }

.imp-preview { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 6px; }
.chip {
  font-size: 11.5px; padding: 4px 9px; border-radius: 12px;
  background: var(--bg); color: var(--text-2);
}
.chip i { font-style: normal; color: var(--text-3); }
.chip.more { color: var(--text-3); }

.hint { font-size: 13px; color: var(--text-3); line-height: 1.7; padding: 8px 0 4px; }

.sh-foot {
  display: flex; gap: 10px; padding: 10px 16px 14px;
  border-top: 1px solid var(--line);
}
.sbtn {
  flex: 1; padding: 12px 0; border-radius: 12px;
  font-size: 15px; background: var(--bg); color: var(--text-2);
}
.sbtn.ok { background: var(--brand); color: #fff; font-weight: 600; }
.sbtn.warn { background: #FFF1E8; color: #FF6B00; font-weight: 600; }

/* ---------- 存储空间明细 ---------- */
.sto-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 0; border-bottom: 1px solid var(--line); font-size: 15px;
}
.sto-row:last-of-type { border-bottom: none; }
.sto-name { color: var(--text-2); }
.sto-val {
  color: var(--text); font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
