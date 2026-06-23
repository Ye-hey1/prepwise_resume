<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { RouterView } from 'vue-router'
import ModuleSidebar from '@/components/common/ModuleSidebar.vue'
import SplashScreen from '@/components/common/SplashScreen.vue'
import ToastContainer from '@/components/common/ToastContainer.vue'

const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)
const showSplash = ref(!localStorage.getItem('prepwise-splash-shown'))
const route = useRoute()

const isInterviewRoute = computed(() => route.name === 'ai-interviewer')

// keep-alive 白名单：仅缓存轻量页面，面试页（含 Three.js）不缓存以节省内存
const keepAliveInclude = ['ResumeEditorView', 'JdAnalysisView', 'QuestionBankView']

const handleSplashFinish = () => {
  showSplash.value = false
  localStorage.setItem('prepwise-splash-shown', 'true')
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}
</script>

<template>
  <SplashScreen v-if="showSplash" @finish="handleSplashFinish" />

  <div class="app-layout">
    <!-- Mobile hamburger -->
    <button
      class="mobile-menu-btn"
      :class="{ 'mobile-menu-btn--open': mobileMenuOpen }"
      type="button"
      aria-label="打开导航菜单"
      @click="mobileMenuOpen = !mobileMenuOpen"
    >
      <span class="mobile-menu-icon" />
    </button>

    <!-- Mobile sidebar backdrop -->
    <transition name="fade">
      <div
        v-if="mobileMenuOpen"
        class="mobile-overlay"
        @click="closeMobileMenu"
      />
    </transition>

    <!-- Sidebar: desktop inline, mobile drawer -->
    <ModuleSidebar
      :collapsed="sidebarCollapsed"
      :class="{ 'sidebar--mobile-open': mobileMenuOpen }"
      class="sidebar-shell"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      @navigate="closeMobileMenu"
    />

    <div class="main-shell" :class="{ 'main-shell--interview': isInterviewRoute }">
      <div class="main-shell-backdrop" :class="{ 'main-shell-backdrop--interview': isInterviewRoute }"></div>
      <main class="main-content" :class="{ 'main-content--interview': isInterviewRoute }">
        <RouterView v-slot="{ Component, route }">
          <transition name="page" mode="out-in">
            <keep-alive :include="keepAliveInclude" :max="3">
              <component :is="Component" :key="route.path" />
            </keep-alive>
          </transition>
        </RouterView>
      </main>
    </div>
  </div>

  <ToastContainer />
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-app);
}

.main-shell {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 0;
  overflow: hidden;
}

.main-shell-backdrop {
  display: none;
}

.main-content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  overflow: hidden;
  min-width: 0;
  border-radius: 0;
  background: var(--bg-shell);
  border: 0;
  box-shadow: none;
}

.main-shell--interview {
  padding: 0;
}

.main-shell-backdrop--interview {
  inset: 0.375rem;
  border-radius: 1rem;
}

.main-content--interview {
  border-radius: 0;
}

/* ── Mobile menu button (hidden on desktop) ── */
.mobile-menu-btn {
  display: none;
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: calc(env(safe-area-inset-left, 0px) + 12px);
  z-index: var(--z-overlay, 100);
  width: 44px;
  height: 44px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: none;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.mobile-menu-btn:hover {
  background: var(--bg-hover);
}

.mobile-menu-icon,
.mobile-menu-icon::before,
.mobile-menu-icon::after {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--text-primary);
  border-radius: 1px;
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.mobile-menu-icon {
  position: relative;
}

.mobile-menu-icon::before,
.mobile-menu-icon::after {
  content: '';
  position: absolute;
  left: 0;
}

.mobile-menu-icon::before { top: -6px; }
.mobile-menu-icon::after  { top: 6px; }

.mobile-menu-btn--open .mobile-menu-icon {
  background: transparent;
}

.mobile-menu-btn--open .mobile-menu-icon::before {
  top: 0;
  transform: rotate(45deg);
}

.mobile-menu-btn--open .mobile-menu-icon::after {
  top: 0;
  transform: rotate(-45deg);
}

/* ── Mobile overlay ── */
.mobile-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sidebar, 10) - 1);
  background: var(--bg-overlay);
}

/* ── Desktop-only transitions ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-slow) var(--ease-standard);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ══════════════════════════════════════
   Breakpoint: Tablet & below (≤1024px)
   ══════════════════════════════════════ */
@media (max-width: 1024px) {
  .mobile-menu-btn {
    display: flex;
  }

  .sidebar-shell {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: var(--z-sidebar, 10);
    transform: translateX(-100%);
    transition: transform var(--duration-moderate) var(--ease-out-quart);
    box-shadow: none;
  }

  .sidebar-shell.sidebar--mobile-open {
    transform: translateX(0);
    box-shadow: none;
  }

  .main-shell {
    padding: 0;
  }

  .main-shell-backdrop {
    inset: 0.5rem;
    border-radius: 0.75rem;
  }

  .main-content {
    border-radius: 0;
  }

  .main-shell--interview {
    padding: 0;
  }

  .main-shell-backdrop--interview {
    inset: 0.25rem;
    border-radius: 0.5rem;
  }

  .main-content--interview {
    border-radius: 0;
  }
}

/* ══════════════════════════════════════
   Breakpoint: Desktop wide (≤1200px)
   ══════════════════════════════════════ */
@media (min-width: 1025px) and (max-width: 1200px) {
  .main-shell--interview {
    padding: 0;
  }

  .main-shell-backdrop--interview {
    inset: 0.25rem;
    border-radius: 0.875rem;
  }

  .main-content--interview {
    border-radius: 0;
  }
}

/* ══════════════════════════════════════
   Breakpoint: Phone (≤640px)
   ══════════════════════════════════════ */
@media (max-width: 640px) {
  .main-shell {
    padding: 0;
  }

  .main-shell-backdrop {
    display: none;
  }

  .main-content {
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
}

/* ── 暗色模式适配 ── */
:root[data-theme="dark"] .app-layout {
  background: var(--bg-app);
}

:root[data-theme="dark"] .main-shell-backdrop {
  background: linear-gradient(180deg, rgba(26, 34, 48, 0.4), rgba(26, 34, 48, 0.2));
  border-color: var(--border-color);
  box-shadow: none;
}

:root[data-theme="dark"] .main-content {
  background: var(--bg-shell);
  border-color: var(--border-color-strong);
  box-shadow: none;
}

:root[data-theme="dark"] .mobile-menu-btn {
  background: var(--bg-elevated);
  border-color: var(--border-color-strong);
}
</style>
