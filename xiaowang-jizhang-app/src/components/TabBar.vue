<script setup>
const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue', 'add'])

const TABS = [
  { key: 'detail',  label: '明细', icon: '📋' },
  { key: 'stats',   label: '图表', icon: '📊' },
  { key: '_add',    label: '',     icon: '＋' },
  { key: 'account', label: '账户', icon: '💳' },
  { key: 'mine',    label: '我的', icon: '👤' }
]

function onTap(t) {
  if (t.key === '_add') emit('add')
  else emit('update:modelValue', t.key)
}
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="t in TABS"
      :key="t.key"
      class="tab"
      :class="{ active: t.key === props.modelValue, fab: t.key === '_add' }"
      @click="onTap(t)"
    >
      <template v-if="t.key === '_add'">
        <span class="fab-circle">{{ t.icon }}</span>
      </template>
      <template v-else>
        <span class="tab-icon">{{ t.icon }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </template>
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: calc(var(--tabbar-h) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: #fff;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: stretch;
  z-index: 50;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-3);
  position: relative;
}

.tab-icon { font-size: 20px; line-height: 1; filter: grayscale(1); opacity: .55; transition: .18s; }
.tab-label { font-size: 11px; }

.tab.active { color: var(--brand); }
.tab.active .tab-icon { filter: none; opacity: 1; }

/* 中间凸起的记一笔按钮 */
.tab.fab { justify-content: flex-start; }
.fab-circle {
  width: 50px; height: 50px;
  margin-top: -22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFB400, var(--brand-dark));
  color: #fff;
  font-size: 30px;
  font-weight: 300;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px rgba(255, 149, 0, .45);
  line-height: 1;
}
</style>
