<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore } from '@/stores/resumeVersions'
import { useThemeStore, type ThemeMode } from '@/stores/theme'

import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import ResumeVersionPanel from '@/components/resume/ResumeVersionPanel.vue'

const props = withDefaults(
  defineProps<{
    collapsed?: boolean
  }>(),
  {
    collapsed: false,
  }
)

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
  (e: 'navigate'): void
}>()

const route = useRoute()
const resumeStore = useResumeStore()
const themeStore = useThemeStore()

const showThemeMenu = ref(false)
const showDataMenu = ref(false)
const showAiConfig = ref(false)
const showVersionPanel = ref(false)

const versionsStore = useResumeVersionsStore()

const themeOptions: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'light', label: '亮色', icon: '☀' },
  { key: 'dark', label: '暗色', icon: '🌙' },
  { key: 'system', label: '跟随系统', icon: '💻' },
]

const primaryMenus = [
  {
    key: 'resume-import' as const,
    label: '简历解析',
    routeName: 'resume-import',
    iconPath:
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  },
  {
    key: 'resume-editor' as const,
    label: '简历编辑',
    routeName: 'resume-editor',
    iconPath:
      'M15 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8Zm0 0v5h5M9 13h6M9 17h4',
  },
  {
    key: 'resume-review' as const,
    label: '简历审查',
    routeName: 'resume-review',
    iconPath:
      'M9 11l2 2 4-5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 17h8',
  },
  {
    key: 'jd-analysis' as const,
    label: 'JD分析',
    routeName: 'jd-analysis',
    iconPath:
      'M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2ZM9 14H5v-4h4m2-1h4v2h-4m4 2h-4v2h4',
  },
  {
    key: 'ai-interviewer' as const,
    label: 'AI面试',
    routeName: 'ai-interviewer',
    iconPath:
      'M9 3h6M12 3v3m-6 4h12a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3l-3 2-3-2H6a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm3 3h.01M15 15h.01',
  },
  {
    key: 'question-bank' as const,
    label: '面试题库',
    routeName: 'question-bank',
    iconPath:
      'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  },
]

const currentThemeOption = computed<{ key: ThemeMode; label: string; icon: string }>(
  () => themeOptions.find((option) => option.key === themeStore.preference) ?? themeOptions[2]!
)

function isMenuActive(menuKey: string): boolean {
  if (menuKey === 'resume-import') return route.name === 'resume-import' || route.path === '/resume-import'
  if (menuKey === 'resume-editor') return route.name === 'resume-editor' || route.path === '/'
  if (menuKey === 'resume-review') return route.name === 'resume-review' || route.path === '/resume-review'
  if (menuKey === 'ai-interviewer') return route.name === 'ai-interviewer' || route.path === '/interview'
  if (menuKey === 'jd-analysis') return route.name === 'jd-analysis' || route.path === '/jd-analysis'
  if (menuKey === 'question-bank') return route.name === 'question-bank' || route.path === '/question-bank'
  return false
}

function getMenuRoute(menuKey: string) {
  if (menuKey === 'resume-import') return { name: 'resume-import' }
  if (menuKey === 'resume-review') return { name: 'resume-review' }
  if (menuKey === 'ai-interviewer') return { name: 'ai-interviewer' }
  if (menuKey === 'jd-analysis') return { name: 'jd-analysis' }
  if (menuKey === 'question-bank') return { name: 'question-bank' }
  return { name: 'resume-editor' }
}

function toggleThemeMenu() {
  showThemeMenu.value = !showThemeMenu.value
  if (showThemeMenu.value) {
    showDataMenu.value = false
  }
}

function toggleDataMenu() {
  showDataMenu.value = !showDataMenu.value
  if (showDataMenu.value) {
    showThemeMenu.value = false
  }
}

function handleThemeSelect(theme: ThemeMode) {
  themeStore.setTheme(theme)
  showThemeMenu.value = false
}

function handleExportClick() {
  showDataMenu.value = false
  showThemeMenu.value = false
  handleExportJSON()
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return

  const clickedThemeMenu = !!(target instanceof Element && target.closest('.theme-switcher'))
  const clickedDataMenu = !!(target instanceof Element && target.closest('.data-switcher'))

  if (showThemeMenu.value && !clickedThemeMenu) {
    showThemeMenu.value = false
  }

  if (showDataMenu.value && !clickedDataMenu) {
    showDataMenu.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  if (showThemeMenu.value) {
    showThemeMenu.value = false
  }

  if (showDataMenu.value) {
    showDataMenu.value = false
  }
}

function handleExportJSON() {
  const data = resumeStore.exportToJSON()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `resume-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImportJSON(e: Event) {
  showDataMenu.value = false
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      if (resumeStore.basicInfo.name || resumeStore.workList.some((w) => w.company)) {
        if (!window.confirm('导入将覆盖当前已有的简历数据，是否继续？')) return
      }
      resumeStore.clearAllData()
      resumeStore.importData(data)
    } catch {
      alert('JSON 文件格式无效，请检查文件内容')
    }
  }
  reader.readAsText(file)
}

watch(
  () => route.fullPath,
  () => {
    showThemeMenu.value = false
    showDataMenu.value = false
  }
)

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: props.collapsed }" :data-collapsed="props.collapsed">
    <div class="brand panel-surface">
      <div class="brand-left">
        <span class="brand-logo-wrap" aria-hidden="true">
          <img class="brand-logo" src="/prepwise-logo.png" alt="PrepWise" />
        </span>
        <div class="brand-copy">
          <span class="brand-text">PrepWise</span>
          <span class="brand-subtitle">AI 驱动的求职面试平台</span>
        </div>
      </div>
      <button
        class="collapse-btn"
        type="button"
        :aria-label="props.collapsed ? '展开侧边菜单' : '收起侧边菜单'"
        :title="props.collapsed ? '展开' : '收缩'"
        :data-tip="props.collapsed ? '展开侧栏' : '收缩侧栏'"
        @click="emit('toggle-collapse')"
      >
        {{ props.collapsed ? '>' : '<' }}
      </button>
    </div>

    <div class="sidebar-section">
      <p class="menu-caption">功能菜单</p>

      <ul class="primary-menu-list">
      <li v-for="menu in primaryMenus" :key="menu.key" class="primary-menu-item">
        <router-link
          class="primary-menu-btn"
          :class="{ active: isMenuActive(menu.key) }"
          :to="getMenuRoute(menu.key)"
          :aria-current="isMenuActive(menu.key) ? 'page' : undefined"
          :title="menu.label"
          @click="emit('navigate')"
        >
          <span class="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path :d="menu.iconPath" />
            </svg>
          </span>
          <span class="menu-label">{{ menu.label }}</span>
        </router-link>
      </li>
      </ul>
    </div>

    <div class="sidebar-footer">
      <div class="footer-actions-shell">
        <div class="theme-switcher">
          <div class="footer-actions-row" role="toolbar" aria-label="侧栏底部操作">
            <button
              class="footer-action-btn footer-action-icon-only"
              :class="{ active: showThemeMenu }"
              type="button"
              :title="`切换主题（当前：${currentThemeOption.label}）`"
              :aria-expanded="showThemeMenu"
              aria-haspopup="dialog"
              @click="toggleThemeMenu"
            >
              <span class="footer-action-icon footer-action-icon-lg">{{ currentThemeOption.icon }}</span>
            </button>

            <div class="data-switcher">
              <button
                class="footer-action-btn footer-action-icon-only"
                :class="{ active: showDataMenu }"
                type="button"
                title="导入 / 导出 JSON"
                :aria-expanded="showDataMenu"
                aria-haspopup="menu"
                @click="toggleDataMenu"
              >
                <span class="footer-action-icon footer-action-icon-lg">⇅</span>
              </button>

              <div v-if="showDataMenu" class="data-menu">
                <button class="data-menu-item" type="button" @click="handleExportClick">
                  <span>↓</span>
                  <span>导出数据</span>
                </button>
                <label class="data-menu-item data-menu-item-file">
                  <span>↑</span>
                  <span>导入 JSON</span>
                  <input type="file" accept=".json" class="hidden-input" @change="handleImportJSON" />
                </label>
              </div>
            </div>

            <button
              class="footer-action-btn footer-action-icon-only footer-action-settings"
              :class="{ active: showAiConfig }"
              type="button"
              title="全局 AI API 配置"
              aria-haspopup="dialog"
              @click="showAiConfig = true"
            >
              <span class="footer-action-icon footer-action-icon-lg">☁️</span>
            </button>

            <button
              class="footer-action-btn footer-action-icon-only"
              :class="{ active: showVersionPanel }"
              type="button"
              :title="`简历版本管理（当前：${versionsStore.activeVersion?.name ?? '默认'}）`"
              aria-haspopup="dialog"
              @click="showVersionPanel = true"
            >
              <span class="footer-action-icon footer-action-icon-lg">📋</span>
            </button>
          </div>

          <div v-if="showThemeMenu" class="theme-menu">
            <button
              v-for="opt in themeOptions"
              :key="opt.key"
              class="theme-menu-item"
              :class="{ active: themeStore.preference === opt.key }"
              @click="handleThemeSelect(opt.key)"
            >
              <span>{{ opt.icon }}</span>
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <AiConfigDialog v-if="showAiConfig" @close="showAiConfig = false" />
    <ResumeVersionPanel v-if="showVersionPanel" @close="showVersionPanel = false" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 272px;
  min-width: 272px;
  background: var(--bg-sidebar);
  padding: 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--border-color-strong);
  overflow-y: auto;
  overflow-x: hidden;
  transition:
    width var(--duration-moderate) var(--ease-out-quint),
    min-width var(--duration-moderate) var(--ease-out-quint),
    padding var(--duration-moderate) var(--ease-out-quint);
  will-change: width;
  scrollbar-width: none;
}
.sidebar::-webkit-scrollbar { display: none; }

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 6px 14px;
  border-bottom: 1px solid rgba(100, 120, 150, 0.14);
}

.brand.panel-surface {
  background: transparent;
  border-top: 0;
  border-right: 0;
  border-left: 0;
  border-radius: 0;
  box-shadow: none;
}

.brand-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}

.brand-logo-wrap {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid rgba(100, 120, 150, 0.18);
  box-shadow: none;
  transition: border-color var(--transition-fast);
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-text {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
}

.brand-subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
}

.collapse-btn {
  position: relative;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--accent-blue-600);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: none;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.collapse-btn::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  top: -8px;
  transform: translate(-50%, -100%);
  background: var(--text-primary);
  color: var(--text-inverse);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  line-height: 1;
  padding: 5px 8px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: 6;
}

.collapse-btn::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -8px;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--text-primary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
  z-index: 6;
}

.collapse-btn:hover::after,
.collapse-btn:hover::before,
.collapse-btn:focus-visible::after,
.collapse-btn:focus-visible::before {
  opacity: 1;
}

.collapse-btn:hover {
  border-color: rgba(43, 123, 184, 0.3);
  background: rgba(43, 123, 184, 0.06);
  color: var(--accent-blue-600);
  box-shadow: none;
}

.menu-caption {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
  padding: 0 6px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
}

.primary-menu-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.primary-menu-btn {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 10px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  box-shadow: none;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
  overflow: hidden;
}

.primary-menu-btn:hover {
  border-color: rgba(43, 123, 184, 0.2);
  background: rgba(43, 123, 184, 0.06);
  box-shadow: none;
  transform: none;
}

.primary-menu-btn.active {
  border-color: rgba(43, 123, 184, 0.24);
  background: rgba(43, 123, 184, 0.08);
  box-shadow: none;
}

.menu-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(43, 123, 184, 0.06);
  color: var(--accent-blue-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.menu-icon svg {
  width: 16px;
  height: 16px;
  transition: all var(--transition-slow);
}

.menu-icon path {
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.primary-menu-btn.active .menu-icon {
  background: rgba(43, 123, 184, 0.14);
  color: var(--accent-blue-700, var(--accent-blue-600));
}

.menu-label {
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 96px;
  min-width: 96px;
  padding: 14px 8px;
}

.sidebar.collapsed .brand-copy,
.sidebar.collapsed .menu-caption,
.sidebar.collapsed .menu-label {
  display: none;
}

.sidebar.collapsed .brand {
  position: relative;
  justify-content: center;
  padding: 12px 8px;
}

/* 收缩时 logo 和菜单图标同尺寸，保证垂直对齐 */
.sidebar.collapsed .brand-logo-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

/* hover 时 logo 向左偏移，给箭头腾出空间 */
.sidebar.collapsed .brand-left {
  transition: transform var(--transition-fast);
}

.sidebar.collapsed .brand:hover .brand-left {
  transform: none;
}

.sidebar.collapsed .collapse-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: var(--text-xs);
  line-height: 1;
  padding: 0;
  opacity: 0;
  background: var(--bg-sidebar);
  box-shadow: none;
}

.sidebar.collapsed .brand:hover .collapse-btn {
  opacity: 0.85;
}

.sidebar.collapsed .collapse-btn:hover {
  opacity: 1 !important;
}

/* 收缩状态下 tooltip 显示在右侧 */
.sidebar.collapsed .collapse-btn::after {
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}

.sidebar.collapsed .collapse-btn::before {
  left: calc(100% + 2px);
  top: 50%;
  transform: translateY(-50%);
  border-left: 6px solid var(--text-primary);
  border-right: none;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

.sidebar.collapsed .primary-menu-btn {
  justify-content: center;
  padding: 12px 8px;
}

.sidebar.collapsed .menu-icon {
  width: 34px;
  height: 34px;
}

.sidebar-footer {
  position: relative;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.footer-actions-shell {
  min-width: 0;
}

.footer-actions-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.footer-action-btn {
  position: relative;
  min-width: 0;
  width: 100%;
  height: 48px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    color var(--transition-fast);
  box-shadow: none;
}

.footer-action-btn:hover {
  border-color: rgba(43, 123, 184, 0.3);
  background: rgba(43, 123, 184, 0.06);
  box-shadow: none;
  transform: none;
}

.footer-action-btn.active {
  border-color: rgba(43, 123, 184, 0.24);
  background: rgba(43, 123, 184, 0.1);
  color: var(--accent-blue-600);
}

.footer-action-icon-only {
  padding: 0;
}

.footer-action-icon {
  line-height: 1;
  flex-shrink: 0;
}

.footer-action-icon-lg {
  font-size: var(--text-xl);
}

.footer-action-settings {
  overflow: visible;
}

.theme-switcher,
.data-switcher {
  position: relative;
}

.theme-menu,
.data-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 156px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: none;
  overflow: hidden;
  z-index: 10;
}

.theme-menu-item,
.data-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  text-align: left;
}

.theme-menu-item:hover,
.data-menu-item:hover {
  background: var(--bg-hover);
}

.theme-menu-item.active {
  color: var(--primary-500);
  font-weight: var(--weight-bold);
}

.data-menu-item-file {
  position: relative;
  overflow: hidden;
}

.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
}

.sidebar.collapsed .sidebar-section .menu-caption {
  display: none;
}

.sidebar.collapsed .footer-actions-row {
  grid-template-columns: 1fr;
}

/* ═══ Mobile drawer mode (≤1024px) ═══ */
@media (max-width: 1024px) {
  .sidebar {
    width: 260px;
    min-width: 260px;
    border-right: 1px solid var(--border-color-strong);
    padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
    padding-left: calc(env(safe-area-inset-left, 0px) + 14px);
    padding-right: calc(env(safe-area-inset-right, 0px) + 14px);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  }

  .collapse-btn {
    display: none;
  }
}

@media (max-width: 640px) {
  .sidebar {
    width: 100vw;
    min-width: 100vw;
    border-right: none;
  }
}
</style>
