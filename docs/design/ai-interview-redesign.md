# AI 面试模块 — 全面 UI/UX 重设计方案

> 基于 `ui-ux-pro-max` 技能设计系统输出，结合现有代码架构分析
> 版本：v2.0 · 2026-04-22

---

## 一、现状诊断

### 1.1 架构概览

当前模块由 9 个组件组成：

| 组件 | 职责 | 行数 |
|------|------|------|
| `AiInterviewerPanel.vue` | 主编排器（状态机 + 业务逻辑） | ~1300 |
| `InterviewSimulationPanel.vue` | 沉浸式模拟面试（聊天 + 3D 头像） | ~700 |
| `InterviewDrillPanel.vue` | 专项训练 | ~400 |
| `InterviewPrepPanel.vue` | 面试前配置 | ~350 |
| `InterviewReviewPanel.vue` | 复盘报告 | ~300 |
| `JdAnalysisStage.vue` | JD 输入与分析 | ~300 |
| `VrmAvatar.vue` | 3D 虚拟形象 | — |
| `ResumePreviewOverlay.vue` | 简历浮层 | — |
| `ModelSelector.vue` | 模型选择器 | — |

### 1.2 核心问题

**信息架构问题：**
1. 五阶段线性流程（JD分析 → 配置 → 模拟 → 训练 → 复盘）过于死板，用户无法自由跳转
2. 左右分栏布局在非沉浸阶段浪费了右侧面板（仅配置仪表盘和引导），信息密度低
3. 沉浸式阶段与普通阶段的切换体验割裂，布局模式完全不同（双栏 → 全屏暗色）

**交互体验问题：**
4. 模拟面试的 3D 头像面板固定宽度 280px，在 15 寸以下屏幕占用过多空间
5. 答题思路浮窗（hint）采用全屏遮罩模态框，打断了沉浸式面试流
6. 语音输入切换需要手动点击，没有自动静音检测（VAD）
7. 计时器仅在沉浸式阶段顶部显示，非沉浸阶段不可见

**视觉设计问题：**
8. 主题不一致：非沉浸阶段用浅色主题，沉浸阶段切换到深色主题，体验断裂
9. 暗色沉浸阶段的 hint 弹窗用了另一套暗色配色，与主面板视觉语言不统一
10. 步进器导航（aurora-nav）只有数字+标签，缺少阶段内容预览

**可访问性问题：**
11. 所有 SVG 图标缺少 `aria-label`
12. 聊天气泡中 AI 内容用 `v-safe-html` 渲染 markdown，缺少语义化结构
13. 语音录音按钮没有实时音量反馈

---

## 二、信息架构重构

### 2.1 从线性五阶段到三核模块

```
旧架构（线性流水线）：
  JD输入 → 配置 → 模拟面试 → 专项训练 → 复盘

新架构（三核并行 + 自由导航）：
  ┌─────────────────────────────────────────────┐
  │  📋 面试准备中心                              │
  │  ┌─ JD 分析卡 ─┐ ┌─ 策略配置卡 ─┐           │
  │  │ 岗位画像     │ │ 模式/时长/难度│           │
  │  │ 技能缺口     │ │ 追问重点      │           │
  │  └─────────────┘ └──────────────┘           │
  ├─────────────────────────────────────────────┤
  │  🎯 实战训练区                                │
  │  [模拟面试]  [专项训练]  [历史记录]            │
  └─────────────────────────────────────────────┤
  │  📊 复盘中心                                  │
  │  综合评分 · 改进建议 · 简历优化 · 历史趋势      │
  └─────────────────────────────────────────────┘
```

**核心变化：**
- "JD 分析"和"配置"合并为一个准备面板的两列卡片，一次看到全貌
- "模拟面试"和"专项训练"成为并行的训练模式，可随时切换
- "复盘"始终可访问，不依赖流程完成

### 2.2 全局导航结构

```
顶部 Tab Bar（始终可见）：
  [准备] [模拟] [训练] [复盘]

侧边信息栏（可折叠）：
  - 当前岗位上下文
  - 简历缺口提醒
  - AI 配置快捷入口
```

---

## 三、布局设计

### 3.1 统一布局系统

**移除"非沉浸/沉浸"双模式切换**，采用统一的布局结构：

```
┌──────────────────────────────────────────────────────┐
│  全局导航栏 (56px)                                    │
│  [Logo] [准备] [模拟] [训练] [复盘]    [配置] [模型]  │
├──────────────────────────────────────────┬───────────┤
│                                          │           │
│  主内容区                                │  上下文   │
│  (根据 Tab 切换内容)                      │  侧栏    │
│                                          │  (240px)  │
│                                          │  可折叠   │
│                                          │           │
├──────────────────────────────────────────┴───────────┤
│  状态条 (40px) — 计时器 · 轮次 · 模式 · 快捷操作      │
└──────────────────────────────────────────────────────┘
```

### 3.2 各 Tab 布局细节

**Tab 1: 准备（Preparation Hub）**

```
┌────────────────────────────────────────────────┐
│  双列卡片布局                                   │
│  ┌─── JD 智能分析 ──────┐ ┌─── 面试策略配置 ──┐ │
│  │ 📄 岗位画像           │ │ 🎭 面试模式       │ │
│  │  ├ 目标岗位           │ │  ○ 面试者         │ │
│  │  ├ 资历级别           │ │  ○ 面试官         │ │
│  │  ├ 核心技能 [tag]...  │ │                   │ │
│  │  └ 简历缺口 [warn]... │ │ ⏱ 时长/难度      │ │
│  │                       │ │ 📝 追问重点       │ │
│  │ [粘贴新 JD]           │ │ 🎭 面试官形象     │ │
│  │ [复用上次分析]         │ │                   │ │
│  └───────────────────────┘ └───────────────────┘ │
│                                                   │
│  ┌─── 历史练习记录 ────────────────────────────┐ │
│  │ 最近5次 · 趋势图 · 快速重做                    │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

**Tab 2: 模拟面试（Simulation）**

```
┌──────────────────────────────────────┬──────────┐
│  聊天区域（flex: 1）                  │ 3D 形象  │
│                                      │ (可折叠)  │
│  ┌─────────────────────────────────┐ │ ┌──────┐ │
│  │ AI: 请介绍一下你最近的项目...    │ │ │ 面试 │ │
│  │                                 │ │ │ 官   │ │
│  │ You: 在上一个项目中，我负责...   │ │ │ 3D   │ │
│  │                                 │ │ │      │ │
│  │ AI: 能具体说说你遇到的挑战吗？   │ │ └──────┘ │
│  │                                 │ │          │
│  │ [思路提示浮层 — 内嵌在聊天中]    │ │ ┌──────┐ │
│  │                                 │ │ │ 你   │ │
│  └─────────────────────────────────┘ │ │ 3D   │ │
│                                      │ └──────┘ │
│  ┌─ 输入栏 ─────────────────────────┐ │          │
│  │ [🎤] [💡] [输入框...] [发送 ➤]  │ │ 统计     │
│  └──────────────────────────────────┘ │ 轮次:3   │
└──────────────────────────────────────┴──────────┘
│  状态条: ⏱ 25:30 | 第3轮 | 💡1/3 | 📋 前端开发    │
```

**Tab 3: 专项训练（Drill）**

```
┌──────────────────────────────────────────────────┐
│  ┌─ 进度条 ─────────────────────────────────────┐ │
│  │ ████████░░░░░░░░ 5/12                        │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌─ 题目卡 ─────────────────────────────────────┐ │
│  │ Q5 · 项目深挖 · ★★★☆☆                       │ │
│  │                                               │ │
│  │ "请描述一个你主导的性能优化项目，              │ │
│  │  具体做了哪些量化分析？"                       │ │
│  │                                               │ │
│  │ 考察意图: 技术深度 + 量化思维                  │ │
│  │ 推荐框架: STAR 法则                           │ │
│  │                                               │ │
│  │ ┌─ 你的回答 ──────────────────────────────┐  │ │
│  │ │                                          │  │ │
│  │ │                                          │  │ │
│  │ └──────────────────────────────────────────┘  │ │
│  │                                               │ │
│  │ [上一题] [收藏] [跳过] [提交并下一题]          │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**Tab 4: 复盘（Review）**

```
┌──────────────────────────────────────────────────┐
│  ┌─ 综合评分 Hero ──────────────────────────────┐ │
│  │                                              │ │
│  │     72 / 100   通过 ✓                        │ │
│  │                                              │ │
│  │  项目 ████████░░ 80    技能 ██████░░░░ 65     │ │
│  │  工作 █████████░ 85    教育 ███████░░░ 58     │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌─ 改进建议 ───────┐ ┌─ 简历优化建议 ──────────┐ │
│  │ • 项目量化不足    │ │ 📄 项目经历 → 建议补充  │ │
│  │ • 系统设计深度    │ │   量化数据和成果         │ │
│  │ • 追问应对策略    │ │ 📄 专业技能 → 建议加强  │ │
│  └──────────────────┘ │   系统设计相关技能       │ │
│                        └─────────────────────────┘ │
│  ┌─ 历史趋势 ───────────────────────────────────┐ │
│  │ 📈 最近5次评分趋势                            │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 四、交互设计优化

### 4.1 答题思路提示 — 从模态框到嵌入式面板

**当前问题：** hint 弹窗是全屏遮罩模态框，打断面试流

**新方案：** 将 hint 嵌入聊天区域，作为特殊消息气泡

```
┌─────────────────────────────────────────┐
│ AI: 请介绍一下你在 XX 项目中的角色？      │
│                                         │
│ 💡 [思路提示 — 点击展开]                 │
│ ┌─────────────────────────────────────┐ │
│ │ 题型: 项目深挖 | 考察: 技术深度      │ │
│ │                                     │ │
│ │ 推荐结构:                           │ │
│ │ 1. 项目背景（一句话）                │ │
│ │ 2. 我的角色与职责                    │ │
│ │ 3. 核心挑战与解决方案                │ │
│ │ 4. 量化成果                          │ │
│ │                                     │ │
│ │ 推荐开场: 「在 XX 项目中，我作为...」 │ │
│ │ [引用此开场白]                       │ │
│ │                                     │ │
│ │ 参考答案 [展开 10s ▸]               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [输入你的回答...]                        │
└─────────────────────────────────────────┘
```

**交互规则：**
- hint 作为聊天气泡出现，不阻断对话流
- 默认折叠状态（仅显示标题），点击展开
- 参考答案默认隐藏，点击后 10 秒自动收起（保留倒计时进度条）
- 使用次数限制显示在标题行：`💡 1/3`

### 4.2 3D 头像面板优化

**当前问题：** 固定 280px 宽度，小屏幕浪费空间

**新方案：** 三种显示模式，用户可切换

1. **完整模式**（默认）：双头像 + 统计数据，宽度 260px
2. **迷你模式**：单头像 + 状态指示器，宽度 120px，悬浮在聊天区右上角
3. **隐藏模式**：完全隐藏，聊天区占满宽度

**切换方式：** 侧栏顶部 `⋮` 按钮或拖拽边缘调整

### 4.3 语音交互增强

**当前问题：** 手动切换录音，无音量反馈

**新方案：**
- 输入框左侧显示实时音量波形（CSS 动画条）
- 录音中时，输入框边框渐变动画表示正在聆听
- 静音检测（VAD）：停顿 3 秒后自动停止并发送
- 支持 Push-to-Talk：按住空格键录音

### 4.4 键盘快捷键

| 快捷键 | 功能 | 作用域 |
|--------|------|--------|
| `Ctrl+I` | 语音输入切换 | 全局 |
| `Ctrl+Enter` | 发送消息 | 模拟面试 |
| `Ctrl+H` | 打开/关闭思路提示 | 模拟面试 |
| `Ctrl+R` | 查看简历预览 | 模拟面试 |
| `Escape` | 关闭浮层/退出专注 | 全局 |
| `1-4` | 切换 Tab | 全局 |

---

## 五、视觉设计系统

### 5.1 统一色彩系统

**移除双主题切换**，采用统一暗色主题（模拟面试沉浸感强，且 3D 头像需要暗色对比）

```css
:root {
  /* ── 基础色 ── */
  --bg-primary: #0f172a;        /* 主背景 */
  --bg-secondary: #1e293b;      /* 卡片/面板背景 */
  --bg-tertiary: #334155;       /* 输入框/次级背景 */
  --bg-elevated: #0b1120;       /* 悬浮/弹窗背景 */

  /* ── 文字色 ── */
  --text-primary: #f1f5f9;      /* 主文字 */
  --text-secondary: #94a3b8;    /* 次级文字 */
  --text-muted: #64748b;        /* 弱化文字 */

  /* ── 品牌色 ── */
  --accent-primary: #3b82f6;    /* 主强调 - 交互蓝 */
  --accent-secondary: #6366f1;  /* AI 角色 - 靛蓝 */
  --accent-success: #10b981;    /* 成功/通过 */
  --accent-warning: #f59e0b;    /* 警告/计时 */
  --accent-danger: #ef4444;     /* 危险/错误 */

  /* ── 功能色 ── */
  --user-bubble: rgba(59, 130, 246, 0.15);   /* 用户气泡 */
  --ai-bubble: rgba(99, 102, 241, 0.08);      /* AI 气泡 */
  --hint-bubble: rgba(245, 158, 11, 0.08);    /* 提示气泡 */

  /* ── 边框/阴影 ── */
  --border-default: rgba(148, 163, 184, 0.12);
  --border-focus: rgba(59, 130, 246, 0.5);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-elevated: 0 24px 64px rgba(0, 0, 0, 0.3);

  /* ── 圆角 ── */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* ── 间距 ── */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* ── 动画 ── */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}
```

### 5.2 排版系统

```css
/* 字体栈 */
--font-sans: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;

/* 字号阶梯 */
--text-xs: 11px;     /* 标签/徽章 */
--text-sm: 12px;     /* 次级文字/辅助 */
--text-base: 14px;   /* 正文 */
--text-lg: 16px;     /* 小标题 */
--text-xl: 18px;     /* 区块标题 */
--text-2xl: 24px;    /* 页面标题 */
--text-3xl: 32px;    /* 大数字/评分 */
--text-4xl: 48px;    /* Hero 数字 */

/* 字重 */
--weight-normal: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
--weight-black: 800;
```

### 5.3 组件设计规范

**卡片（Card）**
```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  transition: border-color var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out);
}

.card:hover {
  border-color: rgba(59, 130, 246, 0.2);
  box-shadow: var(--shadow-card);
}
```

**按钮（Button）** — 四种变体

| 变体 | 背景 | 文字 | 边框 | 用途 |
|------|------|------|------|------|
| Primary | `--accent-primary` 渐变 | #fff | 无 | 主要操作（开始面试） |
| Secondary | transparent | `--text-secondary` | `--border-default` | 次要操作 |
| Ghost | transparent | `--text-muted` | 无 | 低优先级操作 |
| Danger | rgba(239,68,68,0.08) | `--accent-danger` | rgba(239,68,68,0.2) | 破坏性操作 |

**聊天气泡（Chat Bubble）**
```css
.bubble-user {
  background: var(--user-bubble);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl);
  max-width: 75%;
}

.bubble-ai {
  background: var(--ai-bubble);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm);
  max-width: 80%;
}

.bubble-hint {
  background: var(--hint-bubble);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: var(--radius-lg);
  max-width: 85%;
}
```

**标签（Tag/Badge）**
```css
.tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.02em;
}

.tag-skill    { background: rgba(59, 130, 246, 0.1); color: #60a5fa; }
.tag-gap      { background: rgba(245, 158, 11, 0.1); color: #fbbf24; }
.tag-category { background: rgba(139, 92, 246, 0.1); color: #a78bfa; }
```

### 5.4 动画规范

**遵循 ui-ux-pro-max UX 指南 #7 & #8：**
- 每个视图最多 1-2 个关键动画元素
- 微交互 150-300ms
- 使用 `prefers-reduced-motion` 媒体查询

```css
/* 入场动画 */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate-in {
  animation: fade-up var(--duration-normal) var(--ease-out) both;
}

/* 尊重减弱动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .animate-in { animation: none; opacity: 1; }
  * { transition-duration: 0.01ms !important; }
}
```

---

## 六、各模块详细设计

### 6.1 准备中心（Preparation Hub）

**组件拆分：**
- `PrepHub.vue` — 新容器组件
- `JdInsightCard.vue` — 从 `JdAnalysisStage.vue` 重构
- `StrategyConfigCard.vue` — 从 `InterviewPrepPanel.vue` 重构
- `HistorySnippet.vue` — 历史记录预览条

**交互变化：**
- JD 输入区和配置区在同一视口内并排显示（双列卡片）
- JD 分析结果实时更新到右侧配置卡（技能→追问重点自动填充）
- "开始模拟"按钮始终可见（底部固定），不再需要多步确认
- 历史记录从独立 Tab 移到准备中心底部，以卡片列表形式展示

### 6.2 模拟面试（Simulation）

**组件拆分：**
- `SimulationView.vue` — 新容器组件（包含 Tab 切换到训练/复盘的逻辑）
- `ChatPanel.vue` — 从 `InterviewSimulationPanel.vue` 的聊天部分提取
- `AvatarPanel.vue` — 从 `InterviewSimulationPanel.vue` 的头像部分提取
- `HintBubble.vue` — 新组件，替代模态框的嵌入式提示
- `InputBar.vue` — 新组件，输入栏 + 语音 + 工具按钮

**交互变化：**
- 3D 头像面板支持三种尺寸切换（完整/迷你/隐藏）
- 答题思路以嵌入式气泡出现，不使用全屏遮罩
- 输入栏增加实时音量波形指示器
- 新增"简历预览"侧栏，以滑出面板形式显示，不遮挡聊天

### 6.3 专项训练（Drill）

**组件拆分：**
- `DrillView.vue` — 重构 `InterviewDrillPanel.vue`
- `QuestionCard.vue` — 单题卡片组件
- `DrillProgress.vue` — 进度指示器

**交互变化：**
- 进度条移到顶部固定位置
- 每题卡片包含：题目、考察意图、推荐框架、答题区
- 新增"快速跳题"侧栏导航（题号网格）
- 收藏功能增加成功 toast 反馈（当前仅有标记状态）

### 6.4 复盘中心（Review）

**组件拆分：**
- `ReviewView.vue` — 重构 `InterviewReviewPanel.vue`
- `ScoreHero.vue` — 综合评分 Hero 区域
- `ImprovementCard.vue` — 改进建议卡片
- `ResumeSuggestions.vue` — 简历优化建议
- `TrendChart.vue` — 历史趋势图表

**交互变化：**
- 评分 Hero 区域采用环形进度图（代替当前条形图）
- 新增"历史趋势"区域，展示最近 5-10 次模拟的评分变化
- "优化简历"按钮直接跳转到简历编辑器对应模块，并高亮需要修改的区域
- 对话历史默认折叠，点击展开查看完整聊天记录

---

## 七、状态管理优化

### 7.1 从巨型组件到组合式函数

当前 `AiInterviewerPanel.vue` 承载了所有状态（~1300 行），建议拆分为组合式函数：

```typescript
// composables/useInterviewSession.ts
export function useInterviewSession() {
  // messages, streamingAssistantMessageId, finalEvaluation
  // handleStart, handleSend, handleFinish, handleReset
  // saveSessionState, restoreSessionState
}

// composables/useInterviewTimer.ts
export function useInterviewTimer() {
  // durationMinutes, elapsedSeconds, timerRunning
  // adjustDuration, handleTogglePause
}

// composables/useInterviewJd.ts
export function useInterviewJd() {
  // jdDraft, jdContext, buildJdContextFromStructuredData
  // handleGenerateJdAnalysis, handleReuseStoredJd
}

// composables/useInterviewHint.ts
export function useInterviewHint() {
  // hintData, hintCount, isHinting
  // handleRequestHint, handleDismissHint
}

// composables/useInterviewVoice.ts
export function useInterviewVoice() {
  // isListening, mediaRecorder, speechStream
  // startRecording, stopRecording, handleToggleVoice
  // playAssistantVoice, stopAssistantVoice
}

// composables/useInterviewHistory.ts
export function useInterviewHistory() {
  // historyRecords, loadHistoryRecords
  // persistHistoryRecord, handleDeleteHistoryRecord
}

// composables/useInterviewDrill.ts
export function useInterviewDrill() {
  // drillQuestions, drillLoading, drillSubmitted
  // handleGenerateDrill, handleDrillSubmit
}
```

### 7.2 主编排器简化

重构后的 `AiInterviewerPanel.vue` 只负责：
1. 组合各个 composable
2. 渲染当前 Tab 对应的视图组件
3. 处理 Tab 切换

预计从 ~1300 行减少到 ~200 行。

---

## 八、响应式设计

### 8.1 断点系统

| 断点 | 宽度 | 布局变化 |
|------|------|----------|
| `xl` | ≥1280px | 完整布局（主区+侧栏） |
| `lg` | ≥1024px | 侧栏折叠为浮动面板 |
| `md` | ≥768px | 3D 头像默认迷你模式 |
| `sm` | <768px | 单列布局，头像隐藏 |

### 8.2 移动端适配

**Tab 栏** — 底部固定导航（类似 App 底栏）

```
┌──────────────────────┐
│                      │
│    主内容区           │
│                      │
├──────────────────────┤
│ 📋    🎯    📝    📊  │
│ 准备  模拟  训练  复盘 │
└──────────────────────┘
```

**模拟面试** — 聊天区全屏，头像以小圆点形式显示在消息旁

---

## 九、可访问性清单

遵循 `ui-ux-pro-max` UX Guidelines：

1. **对比度** — 所有文字与背景对比度 ≥ 4.5:1（WCAG AA）
2. **焦点指示器** — 所有可交互元素显示 3px 蓝色焦点环
3. **ARIA 标签** — 所有图标按钮添加 `aria-label`
4. **键盘导航** — Tab 顺序与视觉顺序一致
5. **减弱动画** — 尊重 `prefers-reduced-motion`
6. **语义化 HTML** — 使用 `<nav>`, `<main>`, `<section>`, `<article>`
7. **触控目标** — 最小 44×44px（移动端按钮）
8. **错误提示** — 使用 `role="alert"` 或 `aria-live`
9. **颜色非唯一** — 状态不仅用颜色区分，增加图标/文字

---

## 十、实施计划

### Phase 1: 基础重构（2-3天）

1. 创建 composables，将 `AiInterviewerPanel.vue` 的状态逻辑迁移
2. 统一色彩系统（引入 CSS 变量）
3. 统一暗色主题，移除双主题切换

### Phase 2: 布局重构（3-4天）

1. 实现全局 Tab 导航
2. 重构准备中心（双列卡片布局）
3. 模拟面试布局重构（可折叠头像面板）
4. 复盘中心增加趋势图

### Phase 3: 交互优化（2-3天）

1. 答题思路从模态框改为嵌入式气泡
2. 语音交互增强（音量波形、VAD）
3. 输入栏重构
4. 键盘快捷键

### Phase 4: 精细化（1-2天）

1. 动画微调
2. 响应式适配
3. 可访问性审计
4. 性能优化

---

## 附录

### A. 设计参考

- **沉浸式面试体验**：借鉴 Pramp / Interviewing.io 的视频面试布局
- **聊天界面**：借鉴 ChatGPT / Claude 的对话气泡设计
- **3D 头像集成**：借鉴 VRoid Studio 的角色展示方式
- **数据可视化**：借鉴 Linear / Raycast 的仪表盘风格

### B. 技术栈建议

- 保持 Vue 3 + TypeScript
- 图表库考虑引入 `Chart.js` 或 `Apache ECharts`（用于复盘趋势图）
- 动画库保持原生 CSS transitions，复杂场景考虑 `@vueuse/motion`
- 3D 渲染保持现有 Three.js 方案
