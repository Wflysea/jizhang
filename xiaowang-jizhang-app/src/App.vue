<script setup>
import { ref, computed, onMounted } from 'vue'
import { App as CapApp } from '@capacitor/app'
import TabBar from './components/TabBar.vue'
import AddSheet from './components/AddSheet.vue'
import DetailView from './views/DetailView.vue'
import StatsView from './views/StatsView.vue'
import AccountView from './views/AccountView.vue'
import MineView from './views/MineView.vue'
import { state, openAdd } from './store/ledger.js'
import { handleBack } from './utils/back.js'

const VIEWS = { detail: DetailView, stats: StatsView, account: AccountView, mine: MineView }
// 支持 ?tab=stats 直达指定页（便于调试与分享）
const tab = ref(new URLSearchParams(location.search).get('tab') || 'detail')
const currentView = computed(() => VIEWS[tab.value])

/* ===== 安卓返回键 =====
 * 有弹层（编辑页 / 选择器 / 调整弹层…）时逐层关闭；
 * 没有任何弹层时，2 秒内连按两次才退出，避免误触直接退出程序。 */
const exitTip = ref('')
let lastBack = 0
let tipTimer = null

onMounted(() => {
  CapApp.addListener('backButton', async () => {
    if (handleBack()) return                 // 已关闭某个弹层，不退出

    const now = Date.now()
    if (now - lastBack < 2000) {             // 连按两次 → 退出
      try { await CapApp.exitApp() } catch (e) { /* Web 环境忽略 */ }
      return
    }
    lastBack = now
    exitTip.value = '再按一次退出应用'
    clearTimeout(tipTimer)
    tipTimer = setTimeout(() => { exitTip.value = '' }, 2000)
  })
})
</script>

<template>
  <div class="phone-frame">
    <component :is="currentView" :key="tab" />

    <TabBar v-model="tab" @add="openAdd('expense')" />

    <AddSheet v-if="state.editing" />

    <div v-if="exitTip" class="exit-tip">{{ exitTip }}</div>
  </div>
</template>

<style scoped>
.exit-tip {
  position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%);
  background: rgba(0, 0, 0, .78); color: #fff;
  font-size: 13px; padding: 9px 18px; border-radius: 20px;
  z-index: 999; animation: fade .18s ease;
}
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
