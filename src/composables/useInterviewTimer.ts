import { computed, ref, watch } from 'vue'

/**
 * 面试计时器 composable
 *
 * 管理模拟面试的计时逻辑：开始/暂停/调整时长/自动结束
 */
export function useInterviewTimer() {
  const durationMinutes = ref(60)
  const elapsedSeconds = ref(0)
  const sessionStarted = ref(false)
  const timerRunning = ref(false)

  let ticker: ReturnType<typeof setInterval> | null = null

  const totalSeconds = computed(() => Math.max(durationMinutes.value, 1) * 60)
  const remainingSeconds = computed(() => Math.max(totalSeconds.value - elapsedSeconds.value, 0))
  const timerText = computed(() => {
    const minutes = Math.floor(remainingSeconds.value / 60)
    const seconds = remainingSeconds.value % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })
  const timerStatusText = computed(() => {
    if (!sessionStarted.value) return '未开始'
    if (remainingSeconds.value === 0) return '已结束'
    return timerRunning.value ? '进行中' : '已暂停'
  })

  function adjustDuration(delta: number) {
    const next = Math.max(15, Math.min(120, durationMinutes.value + delta))
    if (next === durationMinutes.value) return
    durationMinutes.value = next
    if (!sessionStarted.value) {
      elapsedSeconds.value = 0
    } else {
      elapsedSeconds.value = Math.max(0, Math.min(elapsedSeconds.value, totalSeconds.value - 1))
    }
  }

  function startTimer() {
    sessionStarted.value = true
    timerRunning.value = true
    if (!ticker) {
      ticker = setInterval(() => {
        if (timerRunning.value && remainingSeconds.value > 0) {
          elapsedSeconds.value++
        }
      }, 1000)
    }
  }

  function togglePause() {
    if (!sessionStarted.value || remainingSeconds.value === 0) return
    timerRunning.value = !timerRunning.value
  }

  function stopTimer() {
    timerRunning.value = false
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function resetTimer() {
    stopTimer()
    elapsedSeconds.value = 0
    sessionStarted.value = false
  }

  // 剩余时间为 0 时自动暂停
  watch(remainingSeconds, (value) => {
    if (sessionStarted.value && value === 0) {
      timerRunning.value = false
    }
  })

  return {
    // state
    durationMinutes,
    elapsedSeconds,
    sessionStarted,
    timerRunning,
    // computed
    totalSeconds,
    remainingSeconds,
    timerText,
    timerStatusText,
    // actions
    adjustDuration,
    startTimer,
    togglePause,
    stopTimer,
    resetTimer,
  }
}
