<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { RouterView } from 'vue-router'
import ModuleSidebar from '@/components/common/ModuleSidebar.vue'
import SplashScreen from '@/components/common/SplashScreen.vue'
import ToastContainer from '@/components/common/ToastContainer.vue'

const sidebarCollapsed = ref(false)
const showSplash = ref(!localStorage.getItem('prepwise-splash-shown'))
const route = useRoute()

const isInterviewRoute = computed(() => route.name === 'ai-interviewer')

// keep-alive 白名单：仅缓存轻量页面，面试页（含 Three.js）不缓存以节省内存
const keepAliveInclude = ['ResumeEditorView', 'JdAnalysisView', 'QuestionBankView']

const handleSplashFinish = () => {
  showSplash.value = false
  localStorage.setItem('prepwise-splash-shown', 'true')
}
</script>

<template>
  <SplashScreen v-if="showSplash" @finish="handleSplashFinish" />

  <div class="app-layout">
    <ModuleSidebar
      :collapsed="sidebarCollapsed"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="main-shell" :class="{ 'main-shell--interview': isInterviewRoute }">
      <div class="main-shell-backdrop" :class="{ 'main-shell-backdrop--interview': isInterviewRoute }"></div>
      <main class="main-content" :class="{ 'main-content--interview': isInterviewRoute }">
        <RouterView v-slot="{ Component }">
          <keep-alive :include="keepAliveInclude" :max="3">
            <component :is="Component" />
          </keep-alive>
        </RouterView>
      </main>
    </div>
  </div>

  <ToastContainer />
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(174, 123, 91, 0.14), transparent 30%),
    radial-gradient(circle at bottom right, rgba(44, 74, 107, 0.12), transparent 34%),
    var(--bg-app);
}

.main-shell {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
}

.main-shell-backdrop {
  position: absolute;
  inset: 16px;
  border-radius: 28px;
  background: linear-gradient(180deg, var(--glass-minimal), var(--glass-minimal));
  border: 1px solid var(--glass-minimal);
  box-shadow: var(--shadow-xl);
  pointer-events: none;
}

.main-content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  overflow: hidden;
  min-width: 0;
  border-radius: 24px;
  background: var(--bg-shell);
  border: 1px solid var(--border-color-strong);
  box-shadow: var(--shadow-lg);
}

.main-shell--interview {
  padding: 6px;
}

.main-shell-backdrop--interview {
  inset: 6px;
  border-radius: 24px;
}

.main-content--interview {
  border-radius: 22px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1200px) {
  .main-shell--interview {
    padding: 4px;
  }

  .main-shell-backdrop--interview {
    inset: 4px;
    border-radius: 20px;
  }

  .main-content--interview {
    border-radius: 18px;
  }
}

/* 暗色模式适配 */
:root[data-theme="dark"] .app-layout {
  background:
    radial-gradient(circle at top left, rgba(77, 141, 191, 0.06), transparent 30%),
    radial-gradient(circle at bottom right, rgba(62, 201, 138, 0.04), transparent 34%),
    var(--bg-app);
}

:root[data-theme="dark"] .main-shell-backdrop {
  background: linear-gradient(180deg, rgba(26, 34, 48, 0.4), rgba(26, 34, 48, 0.2));
  border-color: var(--border-color);
  box-shadow: none;
}

:root[data-theme="dark"] .main-content {
  background: var(--bg-shell);
  border-color: var(--border-color-strong);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
</style>
