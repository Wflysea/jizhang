<script setup>
import { computed } from 'vue'
import { accountBalances } from '../store/ledger.js'

const money = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const net = computed(() => accountBalances.value.reduce((a, b) => a + b.balance, 0))
</script>

<template>
  <div class="page">
    <div class="hero">
      <span class="lab">净资产</span>
      <span class="net amount-font">¥{{ money(net) }}</span>
      <span class="cnt">{{ accountBalances.length }} 个账户</span>
    </div>

    <div class="section-title">我的账户</div>
    <div class="card">
      <div v-for="a in accountBalances" :key="a.id" class="acc">
        <span class="ico">{{ a.icon }}</span>
        <div class="info">
          <div class="name">{{ a.name }}</div>
          <div class="sub">{{ a.balance >= 0 ? '正常' : '透支' }}</div>
        </div>
        <span class="bal amount-font" :class="{ neg: a.balance < 0 }">¥{{ money(a.balance) }}</span>
      </div>
    </div>

    <p class="tip">余额由所有流水自动汇总，无需手动维护</p>
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

.acc { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #F7F7F7; }
.acc:last-child { border-bottom: none; }
.ico { width: 36px; height: 36px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 19px; }
.info { flex: 1; }
.name { font-size: 14px; }
.sub { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.bal { font-size: 15px; font-weight: 600; }
.bal.neg { color: var(--expense); }

.tip { font-size: 11px; color: var(--text-3); text-align: center; padding: 14px 0; }
</style>
