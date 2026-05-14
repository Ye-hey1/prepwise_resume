import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'resume-builder-theme'

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemeMode>(
    (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system',
  )

  const isDark = computed(() => {
    if (preference.value === 'dark') return true
    if (preference.value === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  function apply() {
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  }

  watch(isDark, apply, { immediate: true })

  function setTheme(mode: ThemeMode) {
    preference.value = mode
    localStorage.setItem(STORAGE_KEY, mode)
  }

  return {
    preference,
    isDark,
    setTheme,
  }
})
