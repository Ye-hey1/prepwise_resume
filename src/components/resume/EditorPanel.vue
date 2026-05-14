<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch, type Component } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore } from '@/stores/resumeVersions'
import { getModuleIconPaths, MODULE_ICON_VIEWBOX } from '@/constants/moduleIcons'
import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import { useAiConfigStore } from '@/stores/aiConfig'

const store = useResumeStore()
const versionsStore = useResumeVersionsStore()
const AiOptimizePanel = defineAsyncComponent(() => import('@/components/ai/AiOptimizePanel.vue'))
const aiConfig = useAiConfigStore()
const showSaved = ref(false)
const searchValue = ref('')
const nowTick = ref(Date.now())

// ── 模块开关 & AI 面板 ──
const showAiPanel = ref(false)
const showAiConfig = ref(false)
const moduleMenuOpen = ref(false)
const moduleTriggerRef = ref<HTMLElement | null>(null)
const modulePopoverRef = ref<HTMLElement | null>(null)
const draggingModuleKey = ref<string | null>(null)
const dragOverModuleKey = ref<string | null>(null)

// ── JD 跳转：监听 store.pendingScrollToModule ──
watch(
  () => store.pendingScrollToModule,
  (moduleKey) => {
    if (!moduleKey) return
    // 确保模块可见
    if (!store.isModuleVisible(moduleKey)) {
      store.toggleModule(moduleKey)
    }
    expanded[moduleKey] = true
    nextTick(() => {
      scrollToSection(moduleKey)
      store.clearScrollToModule()
    })
  },
)

// ── Quick Nav ──
const sectionRefs = ref<Record<string, HTMLElement | null>>({})
const activeNavKey = ref('')
const navScrollRef = ref<HTMLElement | null>(null)

const enabledModules = computed(() => store.modules.filter((m) => m.visible))

function scrollToSection(key: string) {
  const el = sectionRefs.value[key]
  if (!el) return
  expanded[key] = true
  nextTick(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function updateActiveNav() {
  const panel = document.querySelector('.editor-panel') as HTMLElement | null
  if (!panel) return
  const scrollTop = panel.scrollTop + 80
  let current = ''
  for (const mod of enabledModules.value) {
    const el = sectionRefs.value[mod.key]
    if (!el) continue
    if (el.offsetTop <= scrollTop) {
      current = mod.key
    }
  }
  activeNavKey.value = current
}

watch(activeNavKey, (key) => {
  if (!navScrollRef.value || !key) return
  const nav = navScrollRef.value.querySelector('.quick-nav') as HTMLElement | null
  const tag = navScrollRef.value.querySelector(`[data-nav-key="${key}"]`) as HTMLElement | null
  if (!nav || !tag) return

  const navLeft = nav.scrollLeft
  const navRight = navLeft + nav.clientWidth
  const tagLeft = tag.offsetLeft
  const tagRight = tagLeft + tag.offsetWidth

  if (tagLeft < navLeft) {
    nav.scrollTo({ left: tagLeft - 8, behavior: 'smooth' })
    return
  }

  if (tagRight > navRight) {
    nav.scrollTo({ left: tagRight - nav.clientWidth + 8, behavior: 'smooth' })
  }
})

const expanded = reactive<Record<string, boolean>>({
  basicInfo: true,
  education: false,
  skills: false,
  workExperience: false,
  projectExperience: false,
  awards: false,
  selfIntro: false,
})

const editorMap: Record<string, Component> = {
  basicInfo: defineAsyncComponent(() => import('./editors/BasicInfoEditor.vue')),
  education: defineAsyncComponent(() => import('./editors/EducationEditor.vue')),
  skills: defineAsyncComponent(() => import('./editors/SkillsEditor.vue')),
  workExperience: defineAsyncComponent(() => import('./editors/WorkExperienceEditor.vue')),
  projectExperience: defineAsyncComponent(() => import('./editors/ProjectExperienceEditor.vue')),
  awards: defineAsyncComponent(() => import('./editors/AwardsEditor.vue')),
  selfIntro: defineAsyncComponent(() => import('./editors/SelfIntroEditor.vue')),
}

const visibleCount = computed(() => store.modules.filter((m) => m.visible).length)
const isDefaultOrder = computed(() => store.isDefaultModuleOrder())
const searchKeyword = computed(() => searchValue.value.trim())
const filteredModules = computed(() =>
  store.modules.filter((m) => (searchKeyword.value ? m.label.includes(searchKeyword.value) : true))
)

function hasTextContent(value: string | undefined): boolean {
  if (!value) return false
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return text.length > 0
}

function countFilled(values: Array<string | undefined>): number {
  return values.reduce((count, value) => count + (value?.trim() ? 1 : 0), 0)
}

function scoreByFilled(values: Array<string | undefined>): number {
  if (values.length === 0) return 0
  return countFilled(values) / values.length
}

const moduleCompletion = computed<Record<string, number>>(() => {
  const basic = store.basicInfo

  const basicInfoScore = scoreByFilled([
    basic.name,
    basic.phone,
    basic.email,
    basic.jobTitle,
    basic.expectedLocation,
    basic.educationLevel,
  ])

  const firstEducation = store.educationList.find((e) =>
    [e.school, e.major, e.degree, e.startDate].some((value) => value?.trim())
  )
  const educationScore = firstEducation
    ? scoreByFilled([firstEducation.school, firstEducation.major, firstEducation.degree, firstEducation.startDate])
    : 0

  const firstWork = store.workList.find((w) =>
    [w.company, w.position, w.startDate, w.description].some((value) => value?.trim())
  )
  const workScore = firstWork
    ? scoreByFilled([firstWork.company, firstWork.position, firstWork.startDate, firstWork.description])
    : 0

  const firstProject = store.projectList.find((p) =>
    [p.name, p.role, p.startDate, p.mainWork].some((value) => value?.trim())
  )
  const projectScore = firstProject
    ? scoreByFilled([firstProject.name, firstProject.role, firstProject.startDate, firstProject.mainWork])
    : 0

  const firstAward = store.awardList.find((a) => [a.name, a.date].some((value) => value?.trim()))
  const awardsScore = firstAward ? scoreByFilled([firstAward.name, firstAward.date]) : 0

  return {
    basicInfo: basicInfoScore,
    education: educationScore,
    skills: hasTextContent(store.skills) ? 1 : 0,
    workExperience: workScore,
    projectExperience: projectScore,
    awards: awardsScore,
    selfIntro: hasTextContent(store.selfIntro) ? 1 : 0,
  }
})

const completionPercent = computed(() => {
  const enabledModules = store.modules.filter((m) => m.visible)
  if (enabledModules.length === 0) return 0
  const total = enabledModules.reduce((sum, mod) => sum + (moduleCompletion.value[mod.key] ?? 0), 0)
  return Math.round((total / enabledModules.length) * 100)
})

function handleSave() {
  store.saveToStorage()
  // 手动保存时自动创建快照
  if (versionsStore.activeVersionId) {
    versionsStore.createSnapshot(versionsStore.activeVersionId, '手动保存')
  }
  showSaved.value = true
  setTimeout(() => {
    showSaved.value = false
  }, 2000)
}

const isAutoSavePending = computed(() => store.nextAutoSaveAt !== null)
const importFeedbackText = computed(() => store.importFeedbackText)
const importFeedbackVisible = computed(() => store.importFeedbackVisible)
const autoSaveChipText = computed(() => {
  if (store.isSaving) return '保存中...'

  const nextAt = store.nextAutoSaveAt
  if (nextAt) {
    const remainSec = Math.max((nextAt - nowTick.value) / 1000, 0.1)
    return `${remainSec.toFixed(1)}s 后保存`
  }

  const savedAt = store.lastSavedAt
  if (!savedAt) {
    return `间隔 ${Math.max(store.autoSaveDelayMs / 1000, 0.1).toFixed(1)}s`
  }

  const elapsedMs = Math.max(nowTick.value - savedAt, 0)
  if (elapsedMs < 2_000) return '刚刚保存'
  if (elapsedMs < 60_000) return `${Math.floor(elapsedMs / 1000)}s 前`
  if (elapsedMs < 3600_000) return `${Math.floor(elapsedMs / 60_000)}m 前`
  return '很久以前'
})

function toggleExpand(key: string) {
  expanded[key] = !expanded[key]
}

function moduleIconPaths(key: string): string[] {
  return getModuleIconPaths(key)
}

// ── 模块开关弹出框 ──
function canMoveUp(key: string): boolean {
  return store.canMoveModule(key, 'up')
}

function canMoveDown(key: string): boolean {
  return store.canMoveModule(key, 'down')
}

function moveUp(key: string) {
  store.moveModule(key, 'up')
}

function moveDown(key: string) {
  store.moveModule(key, 'down')
}

function handleResetOrder() {
  store.resetModuleOrder()
}

function handleSwitchDragStart(event: DragEvent, key: string) {
  if (key === 'basicInfo') {
    event.preventDefault()
    return
  }
  draggingModuleKey.value = key
  event.dataTransfer?.setData('text/plain', key)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleSwitchDragOver(event: DragEvent, key: string) {
  if (!draggingModuleKey.value || draggingModuleKey.value === key) return
  event.preventDefault()
  dragOverModuleKey.value = key
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleSwitchDrop(targetKey: string) {
  const sourceKey = draggingModuleKey.value
  if (!sourceKey || sourceKey === targetKey) return
  store.reorderModule(sourceKey, targetKey)
  dragOverModuleKey.value = null
}

function handleSwitchDragEnd() {
  draggingModuleKey.value = null
  dragOverModuleKey.value = null
}

function handleOpenConfigFromPanel() {
  showAiConfig.value = true
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !moduleMenuOpen.value) return
  const clickedTrigger = moduleTriggerRef.value?.contains(target)
  const clickedPopover = modulePopoverRef.value?.contains(target)
  if (!clickedTrigger && !clickedPopover) {
    moduleMenuOpen.value = false
  }
}

function animateSectionHeight(el: Element, height: string) {
  if (!(el instanceof HTMLElement)) return
  el.style.maxHeight = height
}

function handleSectionEnter(el: Element) {
  if (!(el instanceof HTMLElement)) return
  animateSectionHeight(el, '0px')
  el.style.opacity = '0'
  void el.offsetHeight
  animateSectionHeight(el, `${el.scrollHeight}px`)
  el.style.opacity = '1'
}

function handleSectionAfterEnter(el: Element) {
  if (!(el instanceof HTMLElement)) return
  el.style.maxHeight = 'none'
  el.style.opacity = '1'
}

function handleSectionLeave(el: Element) {
  if (!(el instanceof HTMLElement)) return
  animateSectionHeight(el, `${el.scrollHeight}px`)
  el.style.opacity = '1'
  void el.offsetHeight
  animateSectionHeight(el, '0px')
  el.style.opacity = '0'
}

let autoSaveTicker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  autoSaveTicker = setInterval(() => {
    nowTick.value = Date.now()
  }, 200)
  const panel = document.querySelector('.editor-panel') as HTMLElement | null
  if (panel) {
    panel.addEventListener('scroll', updateActiveNav, { passive: true })
  }
  document.addEventListener('mousedown', handleDocumentClick)
})

onUnmounted(() => {
  const panel = document.querySelector('.editor-panel') as HTMLElement | null
  if (panel) {
    panel.removeEventListener('scroll', updateActiveNav)
  }
  if (autoSaveTicker) {
    clearInterval(autoSaveTicker)
    autoSaveTicker = null
  }
  document.removeEventListener('mousedown', handleDocumentClick)
})
</script>

<template>
  <main class="editor-panel">
    <section class="editor-hero panel-surface">
      <div class="editor-hero-main">
        <div class="editor-heading">
          <h1 class="page-title editor-page-title">
            <span class="editor-title-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span>简历编辑</span>
          </h1>
        </div>
        <div class="editor-hero-actions">
          <div ref="moduleTriggerRef" class="hero-action-dropdown">
            <button
              class="hero-action-btn"
              :class="{ active: moduleMenuOpen }"
              type="button"
              title="模块设置"
              @click="moduleMenuOpen = !moduleMenuOpen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              <span class="hero-action-badge">{{ visibleCount }}</span>
            </button>
            <div
              v-if="moduleMenuOpen"
              ref="modulePopoverRef"
              class="module-switch-popover hero-module-popover"
            >
              <div class="module-switch-popover-header">
                <p class="module-switch-popover-title">选择展示模块</p>
                <button
                  class="btn-reset-order-icon"
                  type="button"
                  :disabled="isDefaultOrder"
                  aria-label="恢复默认顺序"
                  title="恢复默认顺序"
                  @click="handleResetOrder"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 11a8 8 0 1 1-2.34-5.66" />
                    <path d="M20 4v7h-7" />
                  </svg>
                </button>
              </div>
              <ul class="module-switch-list">
                <li
                  v-for="mod in store.modules"
                  :key="`switch-${mod.key}`"
                  class="module-switch-item"
                  :class="{
                    active: mod.visible,
                    muted: !mod.visible,
                    draggable: mod.key !== 'basicInfo',
                    dragging: draggingModuleKey === mod.key,
                    'drag-over': dragOverModuleKey === mod.key,
                  }"
                  :draggable="mod.key !== 'basicInfo'"
                  @dragstart="handleSwitchDragStart($event, mod.key)"
                  @dragover="handleSwitchDragOver($event, mod.key)"
                  @drop.prevent="handleSwitchDrop(mod.key)"
                  @dragend="handleSwitchDragEnd"
                >
                  <div class="module-switch-info">
                    <span v-if="mod.key !== 'basicInfo'" class="drag-handle" aria-hidden="true" title="拖拽排序">⋮⋮</span>
                    <span class="module-switch-icon" aria-hidden="true">
                      <svg class="module-switch-icon-svg" :viewBox="MODULE_ICON_VIEWBOX">
                        <path v-for="(d, idx) in moduleIconPaths(mod.key)" :key="`switch-${mod.key}-${idx}`" :d="d" />
                      </svg>
                    </span>
                    <span class="module-switch-label">{{ mod.label }}</span>
                  </div>
                  <div class="module-switch-actions">
                    <div v-if="mod.key !== 'basicInfo' && mod.visible" class="order-actions order-actions-switch">
                      <button class="order-btn" :disabled="!canMoveUp(mod.key)" @click.stop="moveUp(mod.key)">↑</button>
                      <button class="order-btn" :disabled="!canMoveDown(mod.key)" @click.stop="moveDown(mod.key)">↓</button>
                    </div>
                    <label class="custom-toggle">
                      <input
                        type="checkbox"
                        :checked="mod.visible"
                        @change="store.toggleModule(mod.key)"
                      />
                      <div class="custom-toggle-track">
                        <div class="custom-toggle-thumb"></div>
                      </div>
                    </label>
                  </div>
                </li>
              </ul>
            </div>
          </div>


          <span
            class="editor-save-chip status-pill"
            :class="{ 'chip-pending': isAutoSavePending, 'chip-saving': store.isSaving }"
            :title="autoSaveChipText"
            :aria-label="autoSaveChipText"
            role="status"
            aria-live="polite"
          >
            <span v-if="store.isSaving" class="chip-loading" aria-hidden="true"></span>
            <svg v-else class="chip-status-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 7v5l3 2" />
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span class="editor-save-chip-text">{{ autoSaveChipText }}</span>
          </span>
          <button class="btn-save" :class="{ 'btn-save-success': showSaved }" @click="handleSave">
            <transition name="save-icon" mode="out-in">
              <svg v-if="showSaved" key="check" class="save-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              <span v-else key="text">立即保存</span>
            </transition>
          </button>
        </div>
      </div>

      <div class="editor-hero-tools">
        <label class="search-shell">
          <input v-model="searchValue" class="search-input" placeholder="输入搜索：基本信息 / 教育经历 / 其他模块 ..." />
        </label>

        <div class="stats-row">
          <div class="stat-card card-surface">
            <p class="stat-label">简历完整度</p>
            <p class="stat-value">{{ completionPercent }}%</p>
          </div>
          <div class="stat-card card-surface">
            <p class="stat-label">模块已启用</p>
            <p class="stat-value">{{ visibleCount }} / {{ store.modules.length }}</p>
          </div>
        </div>
      </div>

      <div v-if="enabledModules.length > 0" ref="navScrollRef" class="quick-nav-wrap">
        <div class="quick-nav-caption">快速定位</div>
        <div class="quick-nav">
          <button
            v-for="mod in enabledModules"
            :key="`nav-${mod.key}`"
            :data-nav-key="mod.key"
            class="quick-nav-tag"
            :class="{ active: activeNavKey === mod.key }"
            @click="scrollToSection(mod.key)"
          >
            <svg class="quick-nav-icon" :viewBox="MODULE_ICON_VIEWBOX">
              <path v-for="(d, idx) in moduleIconPaths(mod.key)" :key="`nav-icon-${mod.key}-${idx}`" :d="d" />
            </svg>
            <span>{{ mod.label }}</span>
          </button>
        </div>
      </div>
    </section>

    <transition name="fade">
      <div v-if="importFeedbackVisible" class="import-feedback" role="status" aria-live="polite">
        <svg class="import-feedback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span>{{ importFeedbackText }}</span>
      </div>
    </transition>

    <section class="info-editor panel-surface">
      <div class="info-editor-header">
        <div class="editor-title-group">
          <h2 class="editor-title">信息编辑</h2>
          <span v-if="versionsStore.activeVersion" class="version-badge" :title="`当前简历：${versionsStore.activeVersion.name}`">
            {{ versionsStore.activeVersion.name }}
          </span>
        </div>
        <div class="info-editor-actions">
          <transition name="fade">
            <div v-if="showSaved" class="save-hint">
              <svg class="save-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              已保存成功
            </div>
          </transition>
          <button class="ai-editor-btn" type="button" title="AI 深度优化" @click="showAiPanel = true">
            <svg class="ai-sparkle-icon" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <defs>
                <linearGradient id="aiMagicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--accent-blue-400, #4da4e0)" />
                  <stop offset="100%" stop-color="var(--accent-blue-600, #2b7bb8)" />
                </linearGradient>
              </defs>
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" stroke="url(#aiMagicGrad)"/>
            </svg>
            <span class="ai-btn-text">AI 优化</span>
          </button>
        </div>
      </div>

      <div class="module-sections">
        <article
          v-for="mod in filteredModules"
          :id="`module-${mod.key}`"
          :key="mod.key"
          :ref="(el: any) => { if (el) sectionRefs[mod.key] = el as HTMLElement }"
          class="module-block"
          :class="{ disabled: !mod.visible }"
        >
          <header class="module-head" @click="toggleExpand(mod.key)">
            <div class="module-head-left">
              <span class="module-head-icon" aria-hidden="true">
                <svg class="module-head-icon-svg" :viewBox="MODULE_ICON_VIEWBOX">
                  <path v-for="(d, idx) in moduleIconPaths(mod.key)" :key="`${mod.key}-${idx}`" :d="d" />
                </svg>
              </span>
              <div class="module-head-copy">
                <span class="module-head-title">{{ mod.label }}</span>
                <span class="module-head-meta">{{ mod.visible ? '已启用，可继续编辑内容' : '当前已关闭，不会进入最终简历' }}</span>
              </div>
            </div>
            <div class="module-head-right">
              <span v-if="!mod.visible" class="disabled-tag">已关闭</span>
              <span class="expand-text">{{ expanded[mod.key] && mod.visible ? '收起' : '展开' }} ▸</span>
            </div>
          </header>

          <Transition
            name="section-slide"
            @enter="handleSectionEnter"
            @after-enter="handleSectionAfterEnter"
            @leave="handleSectionLeave"
          >
            <div v-if="expanded[mod.key] && mod.visible" class="module-body">
              <component :is="editorMap[mod.key]" />
            </div>
          </Transition>
        </article>

        <div v-if="filteredModules.length === 0" class="empty-result">
          <span class="empty-result-title">没有找到匹配模块</span>
          <span class="empty-result-text">试试搜索更短的关键词，或直接从上方快捷导航进入常用模块。</span>
        </div>
      </div>
    </section>

    <AiOptimizePanel v-if="showAiPanel" @close="showAiPanel = false" @open-config="handleOpenConfigFromPanel" />
    <AiConfigDialog v-if="showAiConfig" @close="showAiConfig = false" />
  </main>
</template>

<style scoped>
.editor-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  container-type: inline-size;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: transparent;
}

.editor-hero {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
}

.editor-hero-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.editor-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.editor-page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.editor-title-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(43, 123, 184, 0.12), rgba(43, 123, 184, 0.03));
  border: 1px solid rgba(43, 123, 184, 0.18);
  color: var(--accent-blue-600);
  box-shadow: 0 4px 10px rgba(43, 123, 184, 0.06);
}

.editor-title-icon-wrap svg {
  width: 16px;
  height: 16px;
}

.workbench-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.title-divider {
  color: var(--border-color-strong);
  font-weight: 300;
  font-size: 18px;
}

.editor-hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.editor-save-chip {
  min-height: 40px;
  padding: 0 14px;
  gap: 8px;
}

.editor-save-chip-text {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-hero-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.search-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.search-input {
  width: 100%;
  height: 48px;
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-lg);
  padding: 0 14px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  box-shadow: inset 0 1px 0 var(--glass-low);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-blue-500);
  box-shadow: var(--focus-ring);
}

.quick-nav-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-nav-caption {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.quick-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.quick-nav::-webkit-scrollbar {
  display: none;
}

.quick-nav-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color);
  background: var(--glass-low);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.18s ease;
}

.quick-nav-tag:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-600);
  background: var(--bg-card);
}

.quick-nav-tag.active {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--text-inverse);
  box-shadow: 0 10px 22px rgba(36, 29, 24, 0.18);
}

.quick-nav-tag.active .quick-nav-icon {
  stroke: var(--text-inverse);
}

.quick-nav-icon,
.chip-status-icon,
.import-feedback-icon,
.save-hint-icon,
.save-check-icon {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.quick-nav-icon,
.chip-status-icon {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}

.chip-pending {
  color: var(--accent-blue-600);
  background: rgba(43, 123, 184, 0.1);
}

.chip-saving {
  color: var(--accent-blue-600);
  background: rgba(43, 123, 184, 0.14);
}

.chip-loading {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid rgba(43, 123, 184, 0.18);
  border-top-color: var(--accent-blue-600);
  animation: chip-spin 0.75s linear infinite;
}

@keyframes chip-spin {
  to {
    transform: rotate(360deg);
  }
}

.stats-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.stat-card {
  padding: 10px 16px;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.stat-value {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--text-primary);
}

.import-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: rgba(29, 143, 94, 0.08);
  border: 1px solid rgba(29, 143, 94, 0.18);
  color: var(--accent-green);
  font-size: 13px;
  font-weight: 600;
}

.import-feedback-icon,
.save-hint-icon {
  width: 15px;
  height: 15px;
  stroke-width: 2;
}

.info-editor {
  padding: 18px;
}

.info-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.editor-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.version-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--accent-info) 10%, transparent);
  color: var(--accent-info);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.editor-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.info-editor-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-editor-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  background: rgba(43, 123, 184, 0.06);
  border: 1px solid rgba(43, 123, 184, 0.18);
  box-shadow: 0 4px 12px rgba(43, 123, 184, 0.04);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ai-editor-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  transform: skewX(-20deg);
  transition: 0.6s ease;
}

.ai-editor-btn:hover::before {
  left: 150%;
}

.ai-editor-btn:hover {
  background: rgba(43, 123, 184, 0.12);
  border-color: rgba(43, 123, 184, 0.35);
  box-shadow: 0 6px 16px rgba(43, 123, 184, 0.12);
  transform: translateY(-1px);
}

@keyframes aiPulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.15); filter: brightness(1.3); }
}

.ai-sparkle-icon {
  width: 16px;
  height: 16px;
  animation: aiPulse 2.5s infinite ease-in-out;
}

.ai-btn-text {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: linear-gradient(90deg, var(--accent-blue-500, #3895d3) 0%, var(--accent-blue-600, #2b7bb8) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── 标题区域操作按钮 ── */
.hero-action-dropdown {
  position: relative;
}

.hero-action-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--glass-low);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.16s ease;
}

.hero-action-btn svg {
  width: 18px;
  height: 18px;
}

.hero-action-btn:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-600);
  background: var(--bg-card);
  box-shadow: 0 8px 18px rgba(30, 42, 60, 0.08);
  transform: translateY(-1px);
}

.hero-action-btn.active {
  border-color: rgba(43, 123, 184, 0.24);
  background: rgba(43, 123, 184, 0.1);
  color: var(--accent-blue-600);
}

.hero-action-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent-blue-600);
  color: var(--text-inverse);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}



/* ── 模块开关弹出框 ── */
.hero-module-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 288px;
  max-width: calc(100cqw - 40px);
  max-height: min(420px, calc(100vh - 100px));
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: 0 16px 30px rgba(30, 42, 60, 0.16);
  z-index: 200;
}

.module-switch-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.module-switch-popover-title {
  color: var(--gray-500);
  font-size: 12px;
  font-weight: 700;
}

.btn-reset-order-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--gray-500);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-reset-order-icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.btn-reset-order-icon:hover:not(:disabled) {
  border-color: var(--primary-500);
  color: var(--primary-500);
}

.btn-reset-order-icon:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.module-switch-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: var(--gray-50);
  transition: all 0.18s ease;
}

.module-switch-item.draggable {
  cursor: grab;
}

.module-switch-item.draggable:active {
  cursor: grabbing;
}

.module-switch-item.active {
  background: var(--bg-card);
  border-color: var(--border-color);
}

.module-switch-item.muted {
  opacity: 0.9;
}

.module-switch-item.dragging {
  opacity: 0.5;
}

.module-switch-item.drag-over {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 1px rgba(43, 123, 184, 0.2) inset;
}

.module-switch-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.drag-handle {
  color: var(--text-secondary);
  letter-spacing: -1px;
  font-size: 13px;
  line-height: 1;
  flex-shrink: 0;
}

.module-switch-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.module-switch-icon-svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--gray-500);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.module-switch-item.active .module-switch-icon-svg {
  stroke: var(--primary-500);
}

.module-switch-label {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.module-switch-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.order-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.order-actions-switch {
  margin-right: 2px;
}

.order-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--gray-500);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
}

.order-btn:hover:not(:disabled) {
  border-color: var(--primary-500);
  color: var(--primary-500);
}

.order-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── 全新隔离样式的开关组件 ── */
.custom-toggle {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
  cursor: pointer;
}

.custom-toggle input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  inset: 0;
  margin: 0;
  cursor: pointer;
  z-index: 5;
}

.custom-toggle-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--gray-300, #e2e8f0);
  border-radius: 20px;
  transition: all 0.2s ease;
  overflow: hidden; /* 绝招：强制裁剪所有溢出点 */
}

/* 显式清除干扰 */
.custom-toggle-track::before,
.custom-toggle-track::after {
  content: none !important;
}

.custom-toggle-thumb {
  position: absolute;
  height: 14px;
  width: 14px;
  left: 3px;
  top: 3px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

.custom-toggle input:checked + .custom-toggle-track {
  background: var(--accent-blue-500, #3b82f6);
}

.custom-toggle input:checked + .custom-toggle-track .custom-toggle-thumb {
  transform: translateX(18px);
}

.custom-toggle:hover .custom-toggle-track {
  filter: brightness(0.95);
}

.editor-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.btn-save {
  border: none;
  min-width: 96px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(54, 80, 111, 0.16);
}

.btn-save:hover {
  transform: translateY(-1px);
}

.btn-save-success {
  background: linear-gradient(135deg, #1d8f5e, #15734b);
  transform: scale(1.03);
}

.save-check-icon {
  width: 18px;
  height: 18px;
  stroke-width: 2.5;
}

.save-icon-enter-active,
.save-icon-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.save-icon-enter-from,
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.save-icon-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.save-hint {
  color: var(--accent-green);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: var(--radius-full);
  background: rgba(29, 143, 94, 0.08);
  border: 1px solid rgba(29, 143, 94, 0.16);
}

.module-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.module-block {
  border-radius: var(--radius-lg);
  background: var(--glass-low);
  border: 1px solid var(--border-color);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.module-block:not(.disabled) {
  border-color: rgba(43, 123, 184, 0.18);
}

.module-block:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.module-block.disabled {
  background: var(--bg-card-muted);
  opacity: 0.82;
}

.module-head {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
}

.module-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.module-head-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.module-head-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
  flex-shrink: 0;
}

.module-head-icon-svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.module-block.disabled .module-head-icon {
  background: rgba(100, 120, 150, 0.12);
  color: var(--text-muted);
}

.module-head-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.module-head-meta {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.module-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.disabled-tag,
.expand-text {
  font-size: 12px;
  font-weight: 700;
}

.disabled-tag {
  color: var(--text-muted);
}

.expand-text {
  color: var(--accent-blue-600);
}

.module-body {
  padding: 0 14px 14px;
}

.empty-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 132px;
  padding: 24px 18px;
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--glass-low), rgba(238, 242, 248, 0.92));
  text-align: center;
}

.empty-result-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-result-text {
  max-width: 420px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.module-body :deep(.editor-section) {
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.module-body :deep(.section-header) {
  display: none;
}

.module-body :deep(.section-body) {
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.module-body :deep(.entry-card) {
  background: var(--bg-card);
  border-color: var(--border-color);
}

.section-slide-enter-active,
.section-slide-leave-active {
  overflow: hidden;
  transition: max-height 0.28s ease, opacity 0.2s ease;
}

.section-slide-enter-from,
.section-slide-leave-to {
  opacity: 0;
}

.section-slide-enter-to,
.section-slide-leave-from {
  opacity: 1;
}

/* ── 容器查询：自适应布局 ── */

/* 1. 中间态：展开预览但宽度尚可 (581px - 850px) */
@container (min-width: 581px) and (max-width: 850px) {
  .editor-hero-main,
  .editor-hero-tools {
    gap: 12px;
  }

  .editor-hero-actions {
    gap: 10px;
  }

  .editor-save-chip-text {
    max-width: 140px;
  }

  .search-shell {
    flex: 1.5; /* 让搜索框占更多一点 space */
  }

  .stats-row {
    gap: 8px;
    flex: 1;
  }

  .stat-card {
    padding: 8px 12px;
    min-width: 90px;
    flex: 1;
  }

  .stat-value {
    font-size: 20px;
  }
}

/* 2. 窄屏模式：强制并排缩小，取消纵向堆叠 (< 580px) */
@container (max-width: 580px) {
  .editor-panel {
    padding: 16px;
    gap: 14px;
  }

  /* 强制回归横向并排 */
  .editor-hero-main,
  .editor-hero-tools {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .editor-page-title {
    font-size: 18px;
  }
  
  .editor-title-icon-wrap {
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }
  
  .editor-title-icon-wrap svg {
    width: 14px;
    height: 14px;
  }

  .editor-hero-actions {
    gap: 6px;
    flex-wrap: nowrap;
    width: auto;
  }

  /* 隐藏非关键的文本以保证横向空间充足 */
  .editor-save-chip-text {
    display: none;
  }
  .editor-save-chip {
    padding: 0 10px;
    min-width: 38px;
    justify-content: center;
  }

  .btn-save {
    min-width: 76px;
    padding: 0 12px;
  }

  .search-shell {
    flex: 1;
    min-width: 100px;
  }
  
  .search-input {
    height: 42px;
    font-size: 12px;
    padding: 0 10px;
  }

  .stats-row {
    flex-shrink: 0;
    width: auto;
    display: flex;
    gap: 8px;
  }

  .stat-card {
    padding: 6px 12px;
    min-width: auto;
  }

  .stat-value {
    font-size: 18px;
  }
  
  .stat-label {
    font-size: 10px;
  }
}

/* 3. 极窄模式：极限压缩 (< 480px) */
@container (max-width: 480px) {
  .editor-panel {
    padding: 12px;
    gap: 12px;
  }

  .editor-hero-actions {
    gap: 4px;
  }

  .module-head-meta,
  .expand-text {
    display: none;
  }

  .module-head {
    min-height: 52px;
    padding: 10px;
  }
}
</style>
