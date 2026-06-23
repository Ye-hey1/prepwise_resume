<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  btnRect?: DOMRect | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', action: string, options?: any): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const menuRef = ref<HTMLElement | null>(null)

// AI 精简程度
const aiLevel = ref<'light' | 'moderate' | 'deep'>('moderate')

// 排版预设
const preset = ref<'compact' | 'standard' | 'relaxed'>('standard')

const presetParams = {
  compact: { pagePaddingY: 16, pagePaddingX: 16, titleMarginBottom: 4, sectionSpacing: 6, lineHeight: 1.5, fontSize: 13 },
  standard: { pagePaddingY: 24, pagePaddingX: 20, titleMarginBottom: 6, sectionSpacing: 8, lineHeight: 1.65, fontSize: 13.5 },
  relaxed: { pagePaddingY: 32, pagePaddingX: 28, titleMarginBottom: 10, sectionSpacing: 14, lineHeight: 1.85, fontSize: 14.5 },
}

const menuStyle = computed(() => {
  if (!props.btnRect) return {}
  
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = 220
  const menuHeight = 280
  
  // 默认右对齐
  let left = props.btnRect.right - menuWidth
  let top = props.btnRect.bottom + 8
  
  // 如果左边超出视口，左对齐
  if (left < 8) {
    left = props.btnRect.left
  }
  
  // 如果右边超出视口，右对齐到视口
  if (left + menuWidth > viewportWidth - 8) {
    left = viewportWidth - menuWidth - 8
  }
  
  // 如果下面超出视口，显示在上方
  if (top + menuHeight > viewportHeight - 8) {
    top = props.btnRect.top - menuHeight - 8
  }
  
  return {
    left: `${left}px`,
    top: `${top}px`,
  }
})

function handleMouseEnter() {
  emit('mouseenter')
}

function handleMouseLeave() {
  emit('mouseleave')
}

function handleOneClick() {
  emit('apply', 'oneclick')
}

function handleAiReduce() {
  emit('apply', 'ai-reduce', { level: aiLevel.value })
}

function handlePreset() {
  emit('apply', 'preset', { params: presetParams[preset.value] })
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-show="visible" 
      ref="menuRef"
      class="smart-layout-menu" 
      :style="menuStyle"
      @click.stop
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <!-- 一键智能排版 -->
      <div class="layout-group">
        <button class="oneclick-btn" @click="handleOneClick">
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>一键智能排版</span>
        </button>
      </div>

      <div class="menu-divider"></div>

      <!-- AI 内容精简 -->
      <div class="layout-group">
        <span class="group-label">AI 内容精简</span>
        <div class="segment-control">
          <div class="segment-btn" :class="{ active: aiLevel === 'light' }" @click="aiLevel = 'light'">
            <span>轻度</span>
          </div>
          <div class="segment-btn" :class="{ active: aiLevel === 'moderate' }" @click="aiLevel = 'moderate'">
            <span>中度</span>
          </div>
          <div class="segment-btn" :class="{ active: aiLevel === 'deep' }" @click="aiLevel = 'deep'">
            <span>深度</span>
          </div>
        </div>
        <button class="apply-btn" @click="handleAiReduce">开始精简</button>
      </div>

      <div class="menu-divider"></div>

      <!-- 排版预设 -->
      <div class="layout-group">
        <span class="group-label">排版预设</span>
        <div class="segment-control">
          <div class="segment-btn" :class="{ active: preset === 'compact' }" @click="preset = 'compact'; handlePreset()">
            <span>紧凑</span>
          </div>
          <div class="segment-btn" :class="{ active: preset === 'standard' }" @click="preset = 'standard'; handlePreset()">
            <span>标准</span>
          </div>
          <div class="segment-btn" :class="{ active: preset === 'relaxed' }" @click="preset = 'relaxed'; handlePreset()">
            <span>宽松</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.smart-layout-menu {
  position: fixed;
  width: 220px;
  padding: 12px;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--border-color, #e5e7eb);
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:root[data-theme="dark"] .smart-layout-menu {
  background: #1e293b;
}

.layout-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
}

.oneclick-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: #4d76e1;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.oneclick-btn:hover {
  background: #3b5fc7;
}

.oneclick-btn svg {
  flex-shrink: 0;
}

.menu-divider {
  height: 1px;
  background: var(--border-color, #e5e7eb);
}

.segment-control {
  display: flex;
  background: var(--gray-100, #f3f4f6);
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

:root[data-theme="dark"] .segment-control {
  background: #0f172a;
}

.segment-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.segment-btn span {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}

.segment-btn:hover span {
  color: var(--text-primary, #374151);
}

:root[data-theme="dark"] .segment-btn:hover span {
  color: #e5e7eb;
}

.segment-btn.active {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:root[data-theme="dark"] .segment-btn.active {
  background: #1e293b;
}

.segment-btn.active span {
  color: #4d76e1;
  font-weight: 600;
}

.apply-btn {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid #4d76e1;
  border-radius: 6px;
  background: transparent;
  color: #4d76e1;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.apply-btn:hover {
  background: #4d76e1;
  color: #fff;
}
</style>
