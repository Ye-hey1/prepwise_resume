<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

interface NavItem {
  id: string
  label: string
  icon: string
  route: string
  active?: boolean
}

const navItems = computed<NavItem[]>(() => [
  {
    id: 'dashboard',
    label: '工作台',
    icon: '⊞',
    route: 'workspace-dashboard',
    active: route.name === 'workspace-dashboard',
  },
  {
    id: 'resume',
    label: '简历编辑',
    icon: '📄',
    route: 'resume-editor',
    active: route.name === 'resume-editor',
  },
  {
    id: 'jd',
    label: 'JD分析',
    icon: '🎯',
    route: 'jd-analysis',
    active: route.name === 'jd-analysis',
  },
  {
    id: 'review',
    label: '简历审查',
    icon: '🔍',
    route: 'resume-review',
    active: route.name === 'resume-review',
  },
  {
    id: 'interview',
    label: '模拟面试',
    icon: '🎙️',
    route: 'ai-interviewer',
    active: route.name === 'ai-interviewer',
  },
  {
    id: 'training',
    label: '训练中心',
    icon: '🏋️',
    route: 'training-center',
    active: route.name === 'training-center',
  },
  {
    id: 'question-bank',
    label: '题库',
    icon: '📚',
    route: 'question-bank',
    active: route.name === 'question-bank',
  },
  {
    id: 'tracker',
    label: '投递追踪',
    icon: '📊',
    route: 'application-tracker',
    active: route.name === 'application-tracker',
  },
])
</script>

<template>
  <nav class="workspace-sidebar">
    <div class="sidebar-logo">
      <span class="logo-icon">✨</span>
    </div>
    <div class="sidebar-nav">
      <RouterLink
        v-for="item in navItems"
        :key="item.id"
        :to="{ name: item.route }"
        class="nav-item"
        :class="{ active: item.active }"
        :title="item.label"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </div>
    <div class="sidebar-footer">
      <button type="button" class="nav-item" title="设置">
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">设置</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.workspace-sidebar {
  display: flex;
  flex-direction: column;
  width: 56px;
  height: 100%;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border-bottom: 1px solid var(--border-color);
}

.logo-icon {
  font-size: 20px;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 6px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.16s ease;
  text-decoration: none;
  position: relative;
}

.nav-item:hover {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-blue-500);
  color: #fff;
}

.nav-label {
  position: absolute;
  left: calc(100% + 12px);
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-4px);
  transition: all 0.16s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.nav-item:hover .nav-label {
  opacity: 1;
  transform: translateX(0);
}

.nav-item.active .nav-label {
  background: var(--accent-blue-500);
  color: #fff;
  border-color: var(--accent-blue-500);
}

.sidebar-footer {
  padding: 8px 6px;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 768px) {
  .workspace-sidebar {
    display: none;
  }
}
</style>
