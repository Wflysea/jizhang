<script setup>
import { ref, computed } from 'vue'
import TabBar from './components/TabBar.vue'
import AddSheet from './components/AddSheet.vue'
import DetailView from './views/DetailView.vue'
import StatsView from './views/StatsView.vue'
import AccountView from './views/AccountView.vue'
import MineView from './views/MineView.vue'
import { state, openAdd } from './store/ledger.js'

const VIEWS = { detail: DetailView, stats: StatsView, account: AccountView, mine: MineView }
// 支持 ?tab=stats 直达指定页（便于调试与分享）
const tab = ref(new URLSearchParams(location.search).get('tab') || 'detail')
const currentView = computed(() => VIEWS[tab.value])
</script>

<template>
  <div class="phone-frame">
    <component :is="currentView" :key="tab" />

    <TabBar v-model="tab" @add="openAdd('expense')" />

    <AddSheet v-if="state.editing" />
  </div>
</template>
