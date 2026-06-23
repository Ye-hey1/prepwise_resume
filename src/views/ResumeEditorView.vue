<script setup lang="ts">
import { ref } from 'vue'
import EditorPanel from '@/components/resume/EditorPanel.vue'
import PreviewPanel from '@/components/resume/PreviewPanel.vue'
import SplitDivider from '@/components/common/SplitDivider.vue'

defineOptions({ name: 'ResumeEditorView' })

const leftWidth = ref(0) // 0 = 使用 CSS 默认值，组件挂载后从 localStorage 加载
const isPreviewCollapsed = ref(false)
const isDragging = ref(false)
</script>

<template>
  <section class="resume-editor-workbench" :class="{ 'preview-collapsed': isPreviewCollapsed, 'is-dragging': isDragging }">
    <EditorPanel 
      class="editor-wrapper" 
      :style="(!isPreviewCollapsed && leftWidth > 0) ? { width: leftWidth + 'px', flex: '0 0 ' + leftWidth + 'px' } : {}" 
    />
    <SplitDivider 
      :class="{ 'divider-hidden': isPreviewCollapsed }" 
      v-model:left="leftWidth" 
      :min-left="300" 
      :min-right="400"
      @drag-start="isDragging = true"
      @drag-end="isDragging = false"
    />
    <PreviewPanel 
      class="preview-wrapper" 
      :class="{ 'collapsed': isPreviewCollapsed }" 
      @collapse="isPreviewCollapsed = true"
    />

    <!-- 当折叠时，展示悬浮展开按钮 -->
    <transition name="fade">
      <button 
        v-if="isPreviewCollapsed"
        class="toggle-preview-btn" 
        @click="isPreviewCollapsed = false" 
        title="展开简历预览"
      >
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="toggle-preview-span">简历预览</span>
      </button>
    </transition>
  </section>
</template>

<style scoped>
.resume-editor-workbench {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* ======== 编辑器面板 ======== */
.editor-wrapper {
  transition: flex var(--duration-slow) var(--ease-standard);
  will-change: flex;
}

/* 拖动分割线时禁用所有过渡动画，确保跟手 */
.resume-editor-workbench.is-dragging .editor-wrapper,
.resume-editor-workbench.is-dragging .preview-wrapper {
  transition: none !important;
}

.resume-editor-workbench.preview-collapsed .editor-wrapper {
  flex: 1 1 100% !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

/* ======== 预览面板 ======== */
.preview-wrapper {
  flex: 1 1 50%;
  min-width: 400px;
  overflow: hidden;
  /*
   * 收起时：先快速滑出 (transform)，再平稳收敛空间 (flex/min-width/opacity)
   * 展开时：先腾出空间 (flex/min-width)，再滑入内容 (transform)
   * 通过 delay 分阶段编排，让视觉主导效果始终是"向右滑出/从右滑入"
   */
  transition:
    transform    var(--duration-slow) var(--ease-standard) 0.08s,
    opacity      var(--duration-moderate) var(--ease-standard) 0.05s,
    flex         var(--duration-slow) var(--ease-standard) 0s,
    min-width    var(--duration-slow) var(--ease-standard) 0s;
  will-change: transform, opacity;
}

.preview-wrapper.collapsed {
  flex: 0 0 0px !important;
  min-width: 0 !important;
  opacity: 0;
  pointer-events: none;
  /*
   * 核心修复：使用视口单位 (vw) 而非百分比
   * 百分比的 translateX(100%) 相对于元素自身宽度——
   * 当 flex 也在收缩宽度时，100% of 0 = 0，位移无效
   * 50vw 始终是屏幕宽度的一半，确保无论宽度怎么变都能可靠地滑出
   */
  transform: translateX(50vw);
  /*
   * 收起反向编排：先滑出 (transform)，再收敛空间 (flex/min-width)
   */
  transition:
    transform    var(--duration-moderate) var(--ease-standard)  0s,
    opacity      var(--duration-base) var(--ease-standard)      0s,
    flex         var(--duration-slow) var(--ease-standard)      0.12s,
    min-width    var(--duration-slow) var(--ease-standard)      0.12s;
}

/* ======== 分割线 ======== */
.divider-hidden {
  width: 0 !important;
  flex: 0 0 0 !important;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  margin: 0 !important;
  padding: 0 !important;
  transition: all var(--transition-slow);
}

/* ======== 展开预览按钮 ======== */
.toggle-preview-btn {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 44px;
  height: 160px;
  padding: 16px 0;
  border-radius: 22px 0 0 22px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-strong);
  border-right: none;
  color: var(--accent-blue-600);
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.toggle-preview-span {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  text-orientation: upright;
  color: inherit;
}

.toggle-preview-btn:hover {
  background: rgba(43, 123, 184, 0.08);
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-600);
}

.toggle-preview-btn svg {
  color: currentColor;
}

.toggle-preview-btn:hover svg {
  transform: none;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity var(--duration-moderate) var(--ease-out-quint),
    transform var(--duration-moderate) var(--ease-out-quint);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(32px);
}

/* ═══ Mobile: stack editor and preview (≤768px) ═══ */
@media (max-width: 768px) {
  .resume-editor-workbench {
    flex-direction: column;
  }

  .editor-wrapper {
    flex: 1 1 auto !important;
    width: 100% !important;
    min-height: 50%;
    transition: none;
  }

  .preview-wrapper {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    min-height: 50%;
    transition: none;
  }

  .preview-wrapper.collapsed {
    flex: 0 0 0 !important;
    min-height: 0 !important;
    min-width: 0 !important;
    transform: none;
  }

  .resume-editor-workbench.preview-collapsed .editor-wrapper {
    flex: 1 1 100% !important;
  }

  .divider-hidden {
    display: none;
  }

  .toggle-preview-btn {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    right: 16px;
    top: auto;
    transform: none;
    width: auto;
    height: 44px;
    padding: 0 16px;
    border-radius: 22px;
    flex-direction: row;
    gap: 6px;
    border-right: 1px solid var(--border-color-strong);
    box-shadow: none;
  }

  .toggle-preview-span {
    writing-mode: horizontal-tb;
    letter-spacing: normal;
    text-orientation: mixed;
  }

  .toggle-preview-btn:hover {
    transform: none;
  }

  .toggle-preview-btn svg {
    transform: rotate(90deg);
  }

  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
    transform: translateY(16px);
  }
}
</style>
