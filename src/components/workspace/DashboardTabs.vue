<script setup lang="ts">
defineOptions({ name: 'DashboardTabs' })

type TabKey = 'overview' | 'opportunities' | 'tracker' | 'analytics'

interface TabItem {
  key: TabKey
  label: string
  hint: string
}

const tabs: TabItem[] = [
  { key: 'overview', label: '总览', hint: '链路与快捷入口' },
  { key: 'opportunities', label: '机会闭环', hint: '按岗位推进' },
  { key: 'tracker', label: '岗位追踪', hint: '投递状态看板' },
  { key: 'analytics', label: '分析中心', hint: '能力与待办信号' },
]

// defineModel 双向绑定父组件的 activeTab
const model = defineModel<TabKey>({ default: 'overview' })
</script>

<template>
  <nav class="dashboard-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      role="tab"
      type="button"
      class="tab-btn"
      :class="{ active: model === tab.key }"
      :aria-selected="model === tab.key"
      @click="model = tab.key"
    >
      <span class="tab-label">{{ tab.label }}</span>
      <span class="tab-hint">{{ tab.hint }}</span>
    </button>
  </nav>
</template>

<style scoped>
.dashboard-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  width: fit-content;
  box-shadow: 0 1px 2px rgba(20, 40, 70, 0.03);
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-height: 44px;
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tab-btn:hover {
  background: rgba(43, 123, 184, 0.05);
}

.tab-btn.active {
  background: var(--primary-600);
}

.tab-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
  transition: color 0.16s ease;
}

.tab-btn:hover .tab-label {
  color: var(--text-primary);
}

.tab-btn.active .tab-label {
  color: #fff;
}

.tab-hint {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  transition: color 0.16s ease;
}

.tab-btn.active .tab-hint {
  color: rgba(255, 255, 255, 0.78);
}
</style>
