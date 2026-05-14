<script setup lang="ts">
import { computed } from 'vue'
import { useResumeStore } from '@/stores/resume'
import { getResumeTemplateByKey, type ResumeTemplateDefinition } from '@/templates/resume'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useResumeStore()

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate,
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)
</script>

<template>
  <aside class="resume-drawer" aria-label="简历预览抽屉">
    <header class="drawer-header">
      <div class="drawer-copy">
        <span class="drawer-kicker">Resume Drawer</span>
        <h3 class="drawer-title">边看简历，边完成这轮模拟面试</h3>
        <p class="drawer-desc">这里展示当前模板下的实时简历内容，方便你在模拟中快速核对项目、经历和技能表达。</p>
      </div>
      <button class="drawer-close" type="button" aria-label="关闭简历预览" @click="emit('close')">关闭</button>
    </header>

    <div class="drawer-meta">
      <span class="meta-pill">当前模板 · {{ currentTemplate.name }}</span>
      <span class="meta-pill">实时同步</span>
    </div>

    <div class="drawer-body">
      <div class="paper-shell">
        <div class="paper-scroll">
          <div class="paper">
            <component :is="currentTemplateComponent" />
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.resume-drawer {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: min(820px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 26px;
  border: 1px solid var(--border-color-strong);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xl);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  z-index: 12;
  animation: drawer-in 260ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes drawer-in {
  from {
    opacity: 0;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.drawer-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 520px;
}

.drawer-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2b7bb8;
}

.drawer-title {
  margin: 0;
  color: #162134;
  font-size: 22px;
  line-height: 1.25;
}

.drawer-desc {
  margin: 0;
  color: #4d6077;
  line-height: 1.7;
}

.drawer-close,
.meta-pill {
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.drawer-close {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(43, 123, 184, 0.12);
  background: rgba(43, 123, 184, 0.06);
  color: #1b6399;
  cursor: pointer;
}

.drawer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.meta-pill {
  min-height: 30px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  background: rgba(43, 123, 184, 0.08);
  color: #1b6399;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  padding: 12px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(240, 245, 250, 0.92), rgba(248, 251, 254, 0.96));
}

.paper-shell,
.paper-scroll {
  width: 100%;
  height: 100%;
}

.paper-scroll {
  overflow: auto;
  padding-right: 8px;
}

.paper {
  width: min(100%, 840px);
  margin: 0 auto;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(16, 29, 47, 0.12);
  border-radius: 18px;
  overflow: hidden;
}

@media (max-width: 820px) {
  .resume-drawer {
    top: 12px;
    right: 12px;
    left: 12px;
    width: auto;
    bottom: 12px;
  }

  .drawer-header {
    flex-direction: column;
  }

  .drawer-close {
    width: 100%;
  }
}
</style>
