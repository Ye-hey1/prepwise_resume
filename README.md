<div align="center">

# PrepWise

**AI 驱动的求职面试全链路平台**

从简历编辑 → JD 分析 → 模拟面试 → 复盘优化，一站式完成求职准备

[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[在线体验](https://prepwise-resume.vercel.app) · [快速开始](#快速开始) · [功能介绍](#核心功能) · [部署指南](#部署)

</div>

---

## 项目简介

PrepWise 是一个纯前端的 AI 求职面试平台，帮助候选人完成从简历撰写到面试实战的完整闭环。所有 AI 功能通过 OpenAI 兼容接口调用，支持接入 DeepSeek、SiliconFlow、OpenRouter、Ollama 等 12+ 模型提供商。

**核心理念：** JD 分析 → 简历优化 → 模拟面试 → 弱项诊断 → 针对性练习 → 再次优化，形成持续改进的闭环。

## 核心功能

### 简历编辑

- 7 个模块化编辑器（基本信息、教育、技能、工作、项目、荣誉、简介）
- 9 套内置模板 + 自定义样式（颜色、字体、间距、布局）
- 模块拖拽排序、可见性开关
- 实时预览 + 智能排版（AI 内容精简 + CSS 自动调整）
- 导出高清 PDF / 压缩 PDF / PNG / Markdown
- 多简历版本管理 + 快照历史回溯
- 简历导入（PDF / Word / 图片 OCR）

### AI 简历优化

- 字段级 + 模块级双层优化
- 三版本输出（标准专业版 / 数据驱动版 / 专家架构版）
- 空字段 AI 内容生成（无需先填内容即可使用）
- JD 感知优化（自动注入岗位要求到 AI prompt）
- 优化前后 Diff 对比视图
- 简历助手（动态例句 + AI 建议 + 素材库）
- 字段字数提示 + 优化历史持久化

### JD 分析

- JD 智能解析（提取职责、技术栈、硬性/软性要求）
- 简历-JD 匹配度评分 + 逐条证据核对
- 备面洞察（高风险追问、推荐案例、能力模型）
- 公司情报（技术栈、竞品、面试风格、反问建议）
- 面试题库自动生成 + 深度追问
- 简历优化建议（基于匹配缺口）
- 分析历史管理（最多 12 条）

### AI 面试

- 双模式：候选人模式（AI 当面试官）/ 面试官模式（AI 当候选人）
- 多轮对话 + 流式渲染 + Markdown 展示
- 面试控制台（开始/暂停/继续/重置/结束评分）
- 计时系统（15-120 分钟）
- 语音输入（浏览器 Speech Recognition）
- 答题思路提示（Copilot）
- VRM 3D 虚拟形象
- 面试结束后综合评分 + 智能推荐下一步

### 面试题库

- JD 分析自动生成 + AI 智能生成 + 手动添加
- 卡片式管理 + 分类/标签/掌握度筛选
- AI 一键生成参考答案（口语化、结合简历）
- 答案可编辑 + 重新生成
- 题目练习直通 AI 面试模块
- Supabase 云端同步（可选，不可用时自动回退 localStorage）

### 闭环学习系统

- JD 分析 ↔ AI 面试双向关联
- 闭环进度步骤条（JD → 分析 → 匹配 → 面试 → 弱项 → 优化 → 达标）
- 学习进度雷达图（6 维度能力追踪）
- 面试评分趋势时间线
- 面试结束后智能推荐下一步
- 模块间导航来源标识

## 界面截图

<table>
  <tr>
    <td><img src="docs/screenshots/edit.png" alt="简历编辑" /></td>
    <td><img src="docs/screenshots/select-template.png" alt="模板选择" /></td>
  </tr>
  <tr>
    <td><em>简历编辑</em></td>
    <td><em>模板选择</em></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ai-optimized.png" alt="AI 优化" /></td>
    <td><img src="docs/screenshots/ai-interview.png" alt="AI 面试" /></td>
  </tr>
  <tr>
    <td><em>AI 优化</em></td>
    <td><em>AI 面试</em></td>
  </tr>
</table>

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API + `<script setup>`) |
| 构建 | Vite 7 |
| 语言 | TypeScript 5.9 |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 4 |
| 代码规范 | ESLint + Oxlint + Oxfmt |
| PDF 导出 | html2canvas + jsPDF + html2pdf.js |
| 文档解析 | pdfjs-dist + mammoth + tesseract.js |
| 3D 渲染 | Three.js + @pixiv/three-vrm |
| Markdown | markdown-it |
| 后端(可选) | Supabase |
| 部署 | Vercel / Docker + Nginx |

## 快速开始

### 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- npm（建议最新稳定版）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/Ye-hey1/prepwise_resume.git
cd prepwise_resume

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:5173`

### AI 模型配置

项目中所有 AI 功能均通过 OpenAI 兼容接口调用：

1. 点击侧边栏底部的云朵图标打开配置面板
2. 填写 API URL、API Key、Model Name
3. 支持多渠道管理 + 按功能分配不同模型

支持的提供商：SiliconFlow、OpenRouter、DeepSeek、智谱 AI、阿里云百炼、Moonshot、OpenAI、Ollama 等。

### 环境变量（可选）

```bash
# Supabase 配置（用于题库云端同步，不配置则使用本地存储）
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 部署

### Vercel（推荐）

项目已配置 `vercel.json`，fork 后在 Vercel 中导入即可自动部署。

### Docker

```bash
# 构建并启动
docker compose up --build -d

# 访问 http://localhost:3000

# 停止
docker compose down
```

## 项目结构

```
src/
├── components/
│   ├── ai/              # AI 配置 + 面试相关组件
│   ├── common/          # 通用组件（侧边栏、富文本、Toast 等）
│   ├── jd/              # JD 分析相关组件
│   ├── questionBank/    # 题库管理组件
│   └── resume/          # 简历编辑器、预览、模板选择
├── composables/         # Vue 组合式函数（面试相关）
├── services/
│   ├── prompts/         # AI 提示词模板（22 个）
│   ├── jd/              # JD 分析子服务
│   └── stream.ts        # 统一 SSE 流式请求
├── stores/              # Pinia 状态管理
├── templates/resume/    # 简历模板（9 套）
├── utils/               # 工具函数
└── views/               # 页面级组件
```

## 常用脚本

```bash
npm run dev          # 开发服务器
npm run build        # 构建（含类型检查）
npm run build-only   # 仅构建前端产物
npm run preview      # 预览构建产物
npm run type-check   # TypeScript 类型检查
npm run lint         # 代码检查（oxlint + eslint）
npm run format       # 代码格式化
```

## 注意事项

- 简历数据默认保存在浏览器本地（localStorage + IndexedDB），无需后端即可完整使用
- 语音输入依赖浏览器 Web Speech API，推荐 Chrome / Edge
- AI 功能需要配置模型接口，未配置时相关按钮会提示引导
- 暗色/亮色主题自动跟随系统，也可手动切换

## 贡献

欢迎提交 Issue 和 Pull Request。

## License

[MIT](./LICENSE)

---

<div align="center">

**如果这个项目对你有帮助，请给一个 Star 支持一下**

</div>
