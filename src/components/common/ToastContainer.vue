<script setup lang="ts">
import { toastState, dismissToast, type ToastType } from '@/utils/toast'

function getIcon(type: ToastType): string {
  switch (type) {
    case 'success': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
    case 'error': return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
    case 'warning': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
    default: return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="item in toastState.items"
          :key="item.id"
          class="toast-item"
          :class="`toast-item--${item.type}`"
          role="alert"
        >
          <svg class="toast-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path :d="getIcon(item.type)" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="toast-message">{{ item.message }}</span>
          <button
            class="toast-close"
            type="button"
            aria-label="关闭通知"
            @click="dismissToast(item.id)"
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg-elevated, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  min-width: 280px;
}

.toast-item--info {
  border-left: 3px solid var(--accent-info, #2b7bb8);
}

.toast-item--success {
  border-left: 3px solid var(--accent-green, #1a8f5e);
}

.toast-item--warning {
  border-left: 3px solid var(--accent-orange, #e08a3a);
}

.toast-item--error {
  border-left: 3px solid var(--accent-red, #d85050);
}

.toast-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.toast-item--info .toast-icon { color: var(--accent-info, #2b7bb8); }
.toast-item--success .toast-icon { color: var(--accent-green, #1a8f5e); }
.toast-item--warning .toast-icon { color: var(--accent-orange, #e08a3a); }
.toast-item--error .toast-icon { color: var(--accent-red, #d85050); }

.toast-message {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #151d2b);
  line-height: 1.4;
}

.toast-close {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-muted, #8496ad);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.toast-close:hover {
  color: var(--text-primary, #151d2b);
}

.toast-close svg {
  width: 14px;
  height: 14px;
}

/* 动画 */
.toast-enter-active {
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.95);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
