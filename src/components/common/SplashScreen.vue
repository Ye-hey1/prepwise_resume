<script setup lang="ts">
import { onMounted, ref } from 'vue'

const emit = defineEmits<{
  (e: 'finish'): void
}>()

const svgView = ref<SVGElement | null>(null)

// 动画配置与数据
const blocksData = [
  { x: 460, y: 140, w: 80, h: 80, rx: 8, type: 'avatar' },
  { x: 560, y: 150, w: 180, h: 24, rx: 4, type: 'title' },
  { x: 560, y: 190, w: 120, h: 12, rx: 2, type: 'sub' },
  { x: 460, y: 250, w: 280, h: 10, rx: 2, type: 'line' },
  { x: 460, y: 270, w: 240, h: 10, rx: 2, type: 'line' },
  { x: 460, y: 290, w: 260, h: 10, rx: 2, type: 'line' },
  // 两列内容
  { x: 460, y: 340, w: 120, h: 60, rx: 6, type: 'box' },
  { x: 600, y: 340, w: 140, h: 10, rx: 2, type: 'line' },
  { x: 600, y: 360, w: 120, h: 10, rx: 2, type: 'line' },
  { x: 600, y: 380, w: 130, h: 10, rx: 2, type: 'line' },

  { x: 460, y: 430, w: 120, h: 60, rx: 6, type: 'box' },
  { x: 600, y: 430, w: 140, h: 10, rx: 2, type: 'line' },
  { x: 600, y: 450, w: 120, h: 10, rx: 2, type: 'line' },
  { x: 600, y: 470, w: 130, h: 10, rx: 2, type: 'line' },
  
  { x: 460, y: 530, w: 280, h: 10, rx: 2, type: 'line' },
  { x: 460, y: 550, w: 200, h: 10, rx: 2, type: 'line' }
]

let fragments: any[] = []
let isAudioPlaying = false
let audioBars: Element[] = []

// 缓动函数
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const easeOutBack = (t: number) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }

// 自定义补间动画引擎
function tween(duration: number, onUpdate: (p: number) => void, easing: (t: number) => number = t => t) {
  return new Promise<void>(resolve => {
    const start = performance.now()
    function step(now: number) {
      let p = (now - start) / duration
      if (p >= 1) {
        onUpdate(easing(1))
        resolve()
      } else {
        onUpdate(easing(p))
        requestAnimationFrame(step)
      }
    }
    requestAnimationFrame(step)
  })
}

// 获取内部元素
const getEl = (id: string) => svgView.value?.querySelector(`#${id}`) as Element

function initFragments() {
  const group = getEl('fragments-group')
  if (!group) return
  group.innerHTML = ''
  fragments = blocksData.map(b => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    const innerG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    
    rect.setAttribute('width', String(b.w))
    rect.setAttribute('height', String(b.h))
    rect.setAttribute('rx', String(b.rx))
    rect.setAttribute('fill', '#4B5563')
    
    innerG.classList.add('floating')
    innerG.style.animationDelay = `${Math.random() * -2}s`
    
    const sX = b.x + (Math.random() - 0.5) * 600
    const sY = b.y + (Math.random() - 0.5) * 400
    const sR = (Math.random() - 0.5) * 120
    
    g.setAttribute('transform', `translate(${sX}, ${sY}) rotate(${sR})`)
    
    innerG.appendChild(rect)
    g.appendChild(innerG)
    group.appendChild(g)
    
    return {
      g, innerG, rect,
      targetX: b.x, targetY: b.y,
      startX: sX, startY: sY, startR: sR,
      type: b.type,
      fixed: false
    }
  })
}

function renderAudioWaves(time: number) {
  if (!isAudioPlaying) return
  audioBars.forEach((bar, i) => {
    const baseHeight = [20, 40, 70, 50, 30][i] || 30
    const noise = Math.sin(time * 0.005 + i) * Math.cos(time * 0.003 + i * 2)
    const height = Math.max(10, baseHeight + noise * 25)
    bar.setAttribute('height', String(height))
    bar.setAttribute('y', String(-height / 2))
  })
  requestAnimationFrame(renderAudioWaves)
}

function resetScene() {
  if (!svgView.value) return
  initFragments()
  getEl('resume-glass')?.setAttribute('opacity', '0')
  const scannerLayer = getEl('scanner-layer')
  scannerLayer?.setAttribute('opacity', '0')
  scannerLayer?.setAttribute('transform', 'translate(-300, 0)')
  
  const resumeLayer = getEl('resume-layer') as HTMLElement
  if (resumeLayer) {
    resumeLayer.setAttribute('transform', 'translate(0, 0) scale(1, 1)')
    resumeLayer.setAttribute('opacity', '1')
    resumeLayer.style.display = 'block'
  }

  const interviewLayer = getEl('interview-layer')
  interviewLayer?.setAttribute('transform', 'translate(600, 350) scale(0, 1) translate(-600, -350)')
  interviewLayer?.setAttribute('opacity', '0')

  getEl('ripple1')?.setAttribute('opacity', '0')
  getEl('ripple2')?.setAttribute('opacity', '0')
  
  const logoGroup = getEl('logo-group')
  logoGroup?.setAttribute('opacity', '0')
  logoGroup?.setAttribute('transform', 'translate(600, 350) scale(0.8) translate(-600, -350)')
  
  getEl('logo-highlight')?.setAttribute('opacity', '0')
  const subTitle = getEl('sub-title')
  subTitle?.setAttribute('opacity', '0')
  subTitle?.setAttribute('transform', 'translate(0, 20)')

  getEl('main-bg')?.setAttribute('opacity', '1')
  getEl('grid-lines')?.setAttribute('opacity', '0.1')
  const container = document.querySelector('.splash-screen-container') as HTMLElement
  if (container) {
    container.style.backgroundColor = '#0A192F'
  }

  isAudioPlaying = false
  audioBars = Array.from(svgView.value.querySelectorAll('.wave-bar'))
}

async function runAnimationSequence() {
  if (!svgView.value) return
  
  // 阶段 1: 刚打开展示凌乱状态（不傻等，极短暂的定格后立马开始集结）
  await tween(100, () => {}, t => t)

  // 阶段 2: 凌乱状态瞬间整齐化一
  const scanner = getEl('scanner-layer')
  scanner?.setAttribute('opacity', '1')
  
  // 扫描线变成一个独立的视觉陪衬特效，以极快速度划过屏幕
  tween(500, (p) => {
    const currentX = -300 + p * 1600
    scanner?.setAttribute('transform', `translate(${currentX}, 0)`)
  }, easeOutCubic)

  // **核心优化**：打破原本死板的扫描线逐个触发，让所有碎片像被磁力场捕捉一样，在极短的 400ms 内并行错落万剑归宗！这极其顺滑。
  const assemblePromises = fragments.map(frag => {
    frag.innerG.classList.remove('floating')
    frag.innerG.style.transform = 'none'
    // 随机 0-100ms 延迟，制造一点错落感，但总体非常迅速
    const delay = Math.random() * 100
    
    return new Promise<void>(resolve => {
      setTimeout(() => {
        tween(300, (fp) => {
          const x = frag.startX + (frag.targetX - frag.startX) * fp
          const y = frag.startY + (frag.targetY - frag.startY) * fp
          const r = frag.startR * (1 - fp)
          frag.g.setAttribute('transform', `translate(${x}, ${y}) rotate(${r})`)
          
          if (fp > 0.5) {
            const color = frag.type === 'avatar' ? '#8A2BE2' : (frag.type === 'title' ? '#00F2FF' : '#F8F9FA')
            frag.rect.setAttribute('fill', color)
            if (frag.type === 'avatar') frag.rect.setAttribute('filter', 'url(#glow-light)')
          }
        }, easeOutCubic).then(resolve)
      }, delay)
    })
  })

  // 等待所有的碎片完美飞回拼合
  await Promise.all(assemblePromises)
  scanner?.setAttribute('opacity', '0')

  // 玻璃底板浮现，加速
  await tween(200, (p) => {
    getEl('resume-glass')?.setAttribute('opacity', String(p))
  }, easeOutCubic)

  // 取消多余的静止欣赏等待，维持极快节奏
  await tween(50, () => {}, t => t)

  // 阶段 3: 3D形变与面试场景 (还原优雅节奏)
  const resumeLayer = getEl('resume-layer') as HTMLElement
  const interviewLayer = getEl('interview-layer')

  tween(250, (p) => {
    const sX = 1 - p
    resumeLayer?.setAttribute('transform', `translate(600, 350) scale(${sX}, 1) translate(-600, -350)`)
    resumeLayer?.setAttribute('opacity', String(1 - p))
  }, easeInOutQuad).then(() => {
    if (resumeLayer) resumeLayer.style.display = 'none'
  })

  await tween(50, () => {}, t => t)

  interviewLayer?.setAttribute('opacity', '1')
  await tween(250, (p) => {
    interviewLayer?.setAttribute('transform', `translate(600, 350) scale(${p}, 1) translate(-600, -350)`)
  }, easeOutBack)

  isAudioPlaying = true
  requestAnimationFrame(renderAudioWaves)

  // 面试波动阶段的短暂留痕
  await tween(300, () => {}, t => t)

  // 阶段 4: 汇聚光束与涟漪 
  isAudioPlaying = false

  await tween(250, (p) => {
    const s = 1 - p
    interviewLayer?.setAttribute('transform', `translate(600, 350) scale(${s}, ${s}) translate(-600, -350)`)
    interviewLayer?.setAttribute('opacity', String(s))
  }, easeInOutQuad)

  const r1 = getEl('ripple1')
  const r2 = getEl('ripple2')
  
  tween(800, (p) => {
    r1?.setAttribute('r', String(p * 400))
    r1?.setAttribute('opacity', String(1 - p))
    r1?.setAttribute('stroke-width', String(6 * (1 - p)))
  }, easeOutCubic)

  tween(1000, (p) => {
    if(p < 0.1) return
    const np = (p - 0.1) / 0.9
    r2?.setAttribute('r', String(np * 300))
    r2?.setAttribute('opacity', String(1 - np))
    r2?.setAttribute('stroke-width', String(4 * (1 - np)))
  }, easeOutCubic)

  const logoGroup = getEl('logo-group')
  logoGroup?.setAttribute('opacity', '1')
  // 王者的涌现
  await tween(400, (p) => {
    const s = 0.8 + p * 0.2
    logoGroup?.setAttribute('transform', `translate(600, 350) scale(${s}) translate(-600, -350)`)
  }, easeOutBack)

  const highlight = getEl('logo-highlight')
  highlight?.setAttribute('opacity', '1')
  tween(500, (p) => {
    // 拉长掠影扫光区间确保覆盖全面扩胸的带两行大字版面
    const x = 200 + p * 800
    highlight?.setAttribute('transform', `skewX(-25) translate(${x - 200}, 0)`)
  }, easeInOutQuad)

  const subTitle = getEl('sub-title')
  await tween(200, (p) => {
    subTitle?.setAttribute('opacity', String(p))
    subTitle?.setAttribute('transform', `translate(0, 0)`)
  }, easeOutCubic)

  // 确保极短的视觉落脚定格
  await tween(100, () => {}, t => t)

  // 阶段 5: 界面华丽揭幕，如同拨开云雾，光破左上并向右下方温柔散开
  // 为了满足神级视觉严控：必须要等它飞到点、完美契合界面排位不动之后，再触发主界面的退云拨雾！
  const mainBg = getEl('main-bg')
  const splashBg = document.getElementById('splash-bg') as HTMLElement

  await tween(700, (p) => {
    // 【终极收缩】将原两秒的大篇章提效压缩到了 700 毫秒！
    const fly_p = Math.min(1, p / 0.4) 
    
    // 伴随镜头狂野推进放大（0~0.4截）
    const currentScale = 1 + fly_p * 0.08
    logoGroup?.setAttribute('transform', `translate(600, 350) scale(${currentScale}) translate(-600, -350)`)

    // 0.45 以后：拨开云雾且伴随消散的神速退场（近乎瞬间扯开黑幕）
    let wp = 0
    if (p > 0.45) {
       wp = (p - 0.45) / 0.55
    }

    if (splashBg && p > 0.45) {
      const exp_wp = Math.pow(wp, 1.2)
      const hole = exp_wp * 150 
      const maskStr = `radial-gradient(circle farthest-corner at 50vw 50vh, transparent ${Math.max(0, hole - 40)}vmax, black ${hole + 20}vmax)`
      splashBg.style.maskImage = maskStr
      splashBg.style.webkitMaskImage = maskStr
    }
    
    if (p > 0.45) mainBg?.setAttribute('opacity', String(1 - Math.pow(wp, 0.6)))
    
    let logicOpacity = 1;
    if (wp > 0.3) {
        logicOpacity = Math.max(0, 1 - (wp - 0.3) / 0.7)
    }

    logoGroup?.setAttribute('opacity', String(logicOpacity))
  }, (t) => t) // 自定义分段已内缩此阶段本身必须原貌平推进

  emit('finish')
}

onMounted(() => {
  resetScene()
  runAnimationSequence()
})
</script>

<template>
  <div class="splash-screen-container">
    <div id="splash-bg" class="splash-bg"></div>
    <svg id="view" viewBox="0 0 1200 700" ref="svgView" class="splash-svg">
        <defs>
            <!-- 背景极光渐变 -->
            <radialGradient id="bg-glow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stop-color="#112240" />
                <stop offset="100%" stop-color="#0A192F" />
            </radialGradient>

            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#8A2BE2" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#8A2BE2" stop-opacity="0"/>
            </radialGradient>

            <!-- 扫描线渐变 -->
            <linearGradient id="scan-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="transparent" />
                <stop offset="80%" stop-color="#8A2BE2" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#00F2FF" stop-opacity="0.9" />
            </linearGradient>

            <!-- 玻璃态背景 -->
            <linearGradient id="glass-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="rgba(255,255,255,0.08)" />
                <stop offset="100%" stop-color="rgba(255,255,255,0.02)" />
            </linearGradient>

            <!-- 滤镜 -->
            <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>

            <filter id="glow-light" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>

            <!-- Logo 剪切路径：用来接收发光高光的形状，它内部其实不可见，仅作形状蒙版 -->
            <clipPath id="logo-clip">
                <!-- 我们给 logo 本身也加上剪切框，使得高光扫过图标也能闪亮整个外壳（可选） -->
                <rect x="340" y="278" width="126" height="126" rx="20"/>
                <text x="492" y="335" font-weight="800" font-size="76" text-anchor="start">PrepWise</text>
                <text x="496" y="390" font-weight="300" font-size="26" text-anchor="start" letter-spacing="3">AI 驱动的求职面试平台</text>
            </clipPath>
        </defs>

        <!-- 背景层 -->
        <rect id="main-bg" width="1200" height="700" fill="url(#bg-glow)" />

        <!-- 阶段 1 & 2: 简历层 -->
        <g id="resume-layer">
            <!-- 玻璃底板 (初始隐藏) -->
            <rect id="resume-glass" x="420" y="100" width="360" height="500" rx="16" fill="url(#glass-bg)" stroke="rgba(0, 242, 255, 0.3)" stroke-width="2" opacity="0" />
            <g id="fragments-group"></g>
        </g>

        <!-- 扫描线层 -->
        <g id="scanner-layer" transform="translate(-300, 0)" opacity="0">
            <rect x="0" y="0" width="200" height="700" fill="url(#scan-grad)" />
            <line x1="200" y1="0" x2="200" y2="700" stroke="#00F2FF" stroke-width="3" filter="url(#glow)" />
            <circle cx="200" cy="350" r="40" fill="url(#core-glow)" />
            <circle cx="200" cy="350" r="8" fill="#F8F9FA" filter="url(#glow)" />
        </g>

        <!-- 阶段 3: 人物与声波面试层 -->
        <g id="interview-layer" transform="translate(600, 350) scale(0, 1) translate(-600, -350)" opacity="0">
            <!-- 人物剪影 -->
            <g id="person-silhouette" transform="translate(450, 220)">
                <!-- 头 -->
                <circle cx="50" cy="40" r="35" fill="url(#glass-bg)" stroke="#00F2FF" stroke-width="2" filter="url(#glow-light)"/>
                <!-- 身体 -->
                <path d="M 10 180 C 10 120, 30 90, 50 90 C 70 90, 90 120, 90 180 Z" fill="url(#glass-bg)" stroke="#00F2FF" stroke-width="2" filter="url(#glow-light)"/>
                <!-- 科技线条修饰 -->
                <path d="M 30 130 L 70 130 M 40 150 L 60 150" stroke="#8A2BE2" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
            </g>

            <!-- 声波 -->
            <g id="audio-waves" transform="translate(620, 350)">
                <rect x="0" y="-10" width="8" height="20" rx="4" fill="#00F2FF" class="wave-bar"/>
                <rect x="16" y="-20" width="8" height="40" rx="4" fill="#8A2BE2" class="wave-bar"/>
                <rect x="32" y="-35" width="8" height="70" rx="4" fill="#00F2FF" class="wave-bar"/>
                <rect x="48" y="-25" width="8" height="50" rx="4" fill="#8A2BE2" class="wave-bar"/>
                <rect x="64" y="-15" width="8" height="30" rx="4" fill="#00F2FF" class="wave-bar"/>
            </g>

            <!-- 麦克风图标 -->
            <g id="mic-icon" transform="translate(720, 320)" class="mic-pulse">
                <rect x="0" y="0" width="24" height="40" rx="12" fill="none" stroke="#F8F9FA" stroke-width="3"/>
                <path d="M -8 30 A 20 20 0 0 0 32 30 M 12 50 L 12 65" stroke="#F8F9FA" stroke-width="3" fill="none" stroke-linecap="round"/>
            </g>
        </g>

        <!-- 阶段 4: 汇聚光束与 Logo -->
        <g id="final-layer">
            <!-- 涟漪 -->
            <circle id="ripple1" cx="600" cy="350" r="0" fill="none" stroke="#00F2FF" stroke-width="2" opacity="0" />
            <circle id="ripple2" cx="600" cy="350" r="0" fill="none" stroke="#8A2BE2" stroke-width="2" opacity="0" />
            <g id="logo-group" opacity="0">
                <!-- 【终极神赐·纯正矢量之魂】：放弃所有的低劣插值图片路线！ -->
                <!-- 亲手用绝对无损的 SVG 数学路径为你重绘一个无限放大的同款超清徽标！ -->
                <!-- 此后即便是放大至一万倍，这标志都将毫无锯齿、如金石般清凌刚正！ -->
                <g transform="translate(340, 278)">
                    <!-- 白色圆角质感盾壳 -->
                    <rect x="0" y="0" width="126" height="126" rx="32" fill="#ffffff" filter="drop-shadow(0px 8px 16px rgba(0, 242, 255, 0.2))" />
                    <!-- PW 本体核心，深海科技蓝 -->
                    <text x="63" y="85" font-family="'Inter', Arial, sans-serif" font-weight="900" font-size="64" text-anchor="middle" fill="#0a192f" letter-spacing="-3">PW</text>
                    <!-- 原标志里的核心科技青色光亮原石（在核心 W 字符左近镶嵌的点睛之笔） -->
                    <circle cx="85" cy="78" r="8" fill="#00F2FF" filter="url(#glow-light)" opacity="0.95" />
                    <circle cx="85" cy="78" r="3" fill="#ffffff" opacity="0.9" />
                </g>
                
                <!-- 霓虹双层重叠：底层弥漫高亮青色光雾 -->
                <text x="492" y="335" font-weight="800" font-size="76" text-anchor="start" fill="#00ffff" filter="url(#glow-light)">PrepWise</text>
                <!-- 霓虹双层重叠：上层保持致密无瑕的纯白内芯，极其锐利！从此彻底解决主次模糊！ -->
                <text x="492" y="335" font-weight="800" font-size="76" text-anchor="start" fill="#ffffff">PrepWise</text>

                <!-- 副标题被施加视觉降权：字重下降、色调转为冷静的高级灰蓝，安心做绿叶 -->
                <text id="sub-title" x="496" y="390" font-weight="300" font-size="26" text-anchor="start" fill="#7ba0b5" letter-spacing="3" opacity="0">AI 驱动的求职面试平台</text>
                
                <!-- 高光遮罩层随之变宽 -->
                <rect id="logo-highlight" x="200" y="250" width="80" height="200" fill="rgba(255,255,255,0.9)" transform="skewX(-25)" clip-path="url(#logo-clip)" opacity="0" />
            </g>
        </g>
    </svg>
  </div>
</template>

<style scoped>
.splash-screen-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: 'Montserrat', 'Noto Sans SC', sans-serif;
    overflow: hidden;
    pointer-events: none; /* 让它在展现动画后期不再截获底下应用由于暴露可能被点击的鼠标事件，提升丝滑度 */
}

.splash-bg {
    position: absolute;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background-color: #0A192F;
    z-index: 1;
    pointer-events: auto; /* 但背景本身是必须隔绝事件的 */
}

.splash-svg {
    position: relative;
    z-index: 2;
    pointer-events: auto;
}

svg {
    width: 100%;
    height: 100%;
    max-width: 1200px;
    user-select: none;
}

/* 初始漂浮动画 */
:deep(.floating) {
    animation: float-anim 3s ease-in-out infinite alternate;
}

@keyframes float-anim {
    0% { transform: translateY(-5px) rotate(-1deg); }
    100% { transform: translateY(5px) rotate(1deg); }
}

/* 麦克风闪烁 */
:deep(.mic-pulse) {
    animation: pulse-anim 1.5s ease-in-out infinite alternate;
}

@keyframes pulse-anim {
    0% { filter: drop-shadow(0 0 2px #00F2FF); opacity: 0.7; }
    100% { filter: drop-shadow(0 0 10px #00F2FF); opacity: 1; }
}
</style>
