<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  label: string
}>()

// 模拟随机出现的科技感背景码
const currentTechLine = ref('')
const techPool = [
  '正在启动深度神经特征识别...',
  '正在构建 JD 语义映射模型...',
  '正在进行简历向量对齐...',
  '结构化提取技能点...',
  '正在加载匹配推演引擎...',
  '正在计算人岗适配综合得分...'
]

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  currentTechLine.value = techPool[Math.floor(Math.random() * techPool.length)] ?? ''
  
  timer = setInterval(() => {
    currentTechLine.value = techPool[Math.floor(Math.random() * techPool.length)] ?? ''
  }, 2500)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="mini-loading-island">
    <!-- 炫彩背景流光 -->
    <div class="island-glow"></div>
    
    <!-- 加载核心器 -->
    <div class="island-core">
      <svg class="ring-svg" viewBox="0 0 50 50">
        <circle class="ring-bg" cx="25" cy="25" r="22" />
        <circle class="ring-stroke" cx="25" cy="25" r="22" />
      </svg>
      <div class="core-dot"></div>
    </div>

    <!-- 文案模块 -->
    <div class="island-text-zone">
      <div class="main-label">{{ label || '系统运算中...' }}</div>
      <div class="sub-labels-stream">
        <Transition name="fade-slide" mode="out-in">
          <div :key="currentTechLine" class="tech-line">
            <span class="cursor-blink">⚡</span> {{ currentTechLine }}
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-loading-island {
  position: fixed;
  bottom: 40px;
  right: 40px;
  z-index: 5000;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 20px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  min-width: 320px;
  animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(40px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.island-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.1), transparent 50%);
  animation: rotate-glow 8s linear infinite;
  pointer-events: none;
}

@keyframes rotate-glow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 核心旋转器 */
.island-core {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ring-svg {
  position: absolute;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: rgba(59, 130, 246, 0.1);
  stroke-width: 3;
}

.ring-stroke {
  fill: none;
  stroke: #3b82f6;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 138; /* 2 * pi * 22 ≈ 138 */
  stroke-dashoffset: 100;
  animation: spin-stroke 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes spin-stroke {
  0% { stroke-dashoffset: 138; transform: rotate(0deg); }
  50% { stroke-dashoffset: 30; transform: rotate(180deg); }
  100% { stroke-dashoffset: 138; transform: rotate(360deg); }
}

.core-dot {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(0.8); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 1; }
}

/* 文字信息区 */
.island-text-zone {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  z-index: 10;
}

.main-label {
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: 0.2px;
}

.sub-labels-stream {
  height: 16px;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.tech-line {
  font-size: 11px;
  font-weight: 700;
  color: #6366f1;
  white-space: nowrap;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  display: inline-block;
  color: #f59e0b;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.3s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
