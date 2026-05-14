# AI 面试模块工作台重设计实施计划

- 日期：2026-04-23
- 关联设计稿：`docs/plans/2026-04-23-ai-interview-workbench-design.md`
- 实施范围：AI 面试模块非模拟面试界面
- 不改范围：`src/components/ai/interview/InterviewSimulationPanel.vue`

## 1. 实施目标

基于已定稿设计方案，分阶段将 AI 面试模块非模拟面试区重构为统一的浅色工作台体系，并保证：

1. 与全站现有蓝灰浅色风格一致。
2. 非模拟面试页面完成布局、标题、间距、模块和交互重构。
3. 模拟面试主战场维持现有深色沉浸式逻辑，不被回归改坏。
4. 实施过程尽量分层推进，降低一次性大改的风险。

## 2. 实施策略

采用“先基础、后页面、再收尾”的顺序：

1. 先统一设计 token 和工作台壳层。
2. 再重做岗位准备页。
3. 再重做专项训练页与面试复盘页。
4. 最后重做配置层、预览层和响应式细节。

原因：

1. Token 和壳层先落地，能避免后续页面各写各的样式。
2. 岗位准备页是用户进入 AI 面试模块的第一屏，优先级最高。
3. 训练与复盘页强依赖新的工作台结构，适合在中期统一重构。
4. 配置层和预览层适合后置收口，避免前期反复返工。

## 3. 分阶段计划

## Phase 0：实现前清理与基线确认

### 目标

确认现有组件边界、样式依赖和状态流，避免直接开改导致范围失控。

### 任务

1. 梳理 `AiInterviewerPanel.vue` 中非模拟态与模拟态的条件分支。
2. 标记当前非模拟面试页面使用到的共享状态、计算属性和事件。
3. 检查 `src/assets/interview-tokens.css` 的编码、变量命名和现有引用关系。
4. 确认 `AiInterviewerPanel.vue`、`JdAnalysisStage.vue`、`InterviewDrillPanel.vue`、`InterviewReviewPanel.vue`、`PrepConfigDialog.vue`、`ResumePreviewOverlay.vue` 的职责边界。

### 产出

1. 一份明确的组件改造边界。
2. 一份要保留的业务逻辑清单。

## Phase 1：重建设计 Token 与工作台壳层

### 目标

建立新的非模拟面试浅色工作台样式基础，同时保留模拟面试深色主题变量。

### 任务

1. 重构 `src/assets/interview-tokens.css`。
2. 修复编码异常，统一为 UTF-8。
3. 将 token 拆成两套语义层：
4. 非模拟面试工作台 token
5. 模拟面试深色 token
6. 补充统一变量：
7. 页面背景
8. 面板背景
9. 标题层级
10. 间距系统
11. 卡片层级
12. 按钮等级
13. 标签与状态色
14. 抽屉/弹窗阴影与层级
15. 在 `AiInterviewerPanel.vue` 中建立新的工作台外壳结构：
16. 顶部头部
17. 主内容区
18. 右侧上下文栏
19. 保证模拟面试态仍沿用原深色容器，不被浅色样式污染。

### 涉及文件

1. `src/assets/interview-tokens.css`
2. `src/components/ai/interview/AiInterviewerPanel.vue`

### 验收

1. 非模拟面试区出现统一浅色工作台壳层。
2. 模拟面试区视觉不回归。
3. 样式变量命名清晰，后续页面可直接复用。

## Phase 2：重做岗位准备页

### 目标

把 `JdAnalysisStage.vue` 从“功能堆叠页”改造成“岗位准备工作台”。

### 任务

1. 重构页面信息架构，拆成：
2. 第一屏准备入口
3. 第二屏解析结果工作台
4. 调整输入区布局：
5. 标题、副标题、说明文案重写
6. JD 输入区变为主任务卡
7. 主按钮与次按钮重新分级
8. 将历史记录从主视区移出，改放右侧栏或抽屉。
9. 将“快速模式”“已有 JD 复用”“使用流程”等信息整理为侧栏摘要卡，而不是并列主卡片。
10. 将解析结果重组为四个核心模块：
11. 这个岗位最看重什么
12. 你的简历还缺什么
13. 优先讲哪几个项目故事
14. 面试官最可能深挖什么
15. 底部增加统一动作条，承接到训练或模拟面试。

### 涉及文件

1. `src/components/ai/interview/JdAnalysisStage.vue`
2. `src/components/ai/interview/AiInterviewerPanel.vue`

### 验收

1. 第一屏只聚焦“如何开始”。
2. 解析完成后，页面主区明显切换到结果工作台。
3. 历史记录不再与主输入区抢视觉重心。

## Phase 3：重做专项训练页

### 目标

把 `InterviewDrillPanel.vue` 从题目容器升级为训练工作区。

### 任务

1. 重构页面为“训练主区 + 能力侧栏”双栏结构。
2. 增加顶部训练模式切换条。
3. 重新分配信息层级：
4. 当前题目
5. 回答输入
6. 即时反馈
7. 当前训练方向
8. 已完成进度
9. 薄弱能力项
10. 推荐下一题
11. 主按钮聚焦到当前训练动作，例如提交回答或进入下一题。
12. 弱化与当前任务无关的辅助按钮。

### 涉及文件

1. `src/components/ai/interview/InterviewDrillPanel.vue`
2. `src/components/ai/interview/AiInterviewerPanel.vue`

### 验收

1. 页面更像训练器而不是题库面板。
2. 用户一眼能看出当前练什么、下一步做什么。
3. 训练反馈能自然导向下一题或切换维度。

## Phase 4：重做面试复盘页

### 目标

把 `InterviewReviewPanel.vue` 改造成诊断报告页。

### 任务

1. 第一屏优先展示总评分、是否通过、核心结论。
2. 将详细内容重组为三类诊断：
3. 回答表现
4. 岗位匹配
5. 简历联动建议
6. 聊天记录改为折叠区或可展开详情，不作为默认主内容。
7. 明确“下一步建议动作”，例如继续训练或调整简历。

### 涉及文件

1. `src/components/ai/interview/InterviewReviewPanel.vue`
2. `src/components/ai/interview/AiInterviewerPanel.vue`

### 验收

1. 复盘页先给结论，再给证据。
2. 用户能直接看懂自己哪里差、为什么差、下一步怎么补。
3. 页面从“结果展示”升级为“行动导向诊断”。

## Phase 5：重做配置层与预览层

### 目标

让配置与预览不再打断主流程。

### 任务

1. 重构 `PrepConfigDialog.vue` 为轻量步骤式配置层。
2. 重新排序配置项优先级：
3. 面试模式
4. 模型选择
5. 时长
6. 重点考察方向
7. 自定义备注
8. 将 `ResumePreviewOverlay.vue` 改造为右侧抽屉预览层。
9. 统一抽屉和弹窗的视觉语言、动效和焦点管理。

### 涉及文件

1. `src/components/ai/interview/PrepConfigDialog.vue`
2. `src/components/ai/interview/ResumePreviewOverlay.vue`

### 验收

1. 配置更像“开始前确认”，而不是复杂表单。
2. 简历预览可边看边配，不打断主操作。
3. 抽屉、弹窗、页内展开的使用边界清晰。

## Phase 6：状态、响应式与一致性收尾

### 目标

统一所有非模拟面试页面的状态表现和细节体验。

### 任务

1. 统一空状态、加载状态、错误状态、完成状态的结构和文案模式。
2. 补充键盘焦点态、状态标签图标和对比度检查。
3. 检查窄屏下的布局重排。
4. 确保右侧上下文栏在中小屏下能安全折叠或下移。
5. 对照全站风格检查：
6. 主色是否一致
7. 圆角是否一致
8. 阴影是否一致
9. 标题节奏是否一致

### 涉及文件

1. `src/components/ai/interview/AiInterviewerPanel.vue`
2. `src/components/ai/interview/JdAnalysisStage.vue`
3. `src/components/ai/interview/InterviewDrillPanel.vue`
4. `src/components/ai/interview/InterviewReviewPanel.vue`
5. `src/components/ai/interview/PrepConfigDialog.vue`
6. `src/components/ai/interview/ResumePreviewOverlay.vue`
7. `src/assets/interview-tokens.css`

### 验收

1. 所有页面状态语义清晰。
2. 响应式下不出现结构崩坏。
3. 与全站模块放在一起看时风格统一。

## 4. 文件改造映射

| 文件 | 改造重点 | 风险等级 |
|---|---|---|
| `src/assets/interview-tokens.css` | token 重建、编码修复、主题分层 | 中 |
| `src/components/ai/interview/AiInterviewerPanel.vue` | 工作台壳层、阶段编排、右侧栏 | 高 |
| `src/components/ai/interview/JdAnalysisStage.vue` | 入口与结果工作台重构 | 高 |
| `src/components/ai/interview/InterviewDrillPanel.vue` | 训练工作区重构 | 中 |
| `src/components/ai/interview/InterviewReviewPanel.vue` | 诊断报告页重构 | 中 |
| `src/components/ai/interview/PrepConfigDialog.vue` | 步骤式配置层 | 中 |
| `src/components/ai/interview/ResumePreviewOverlay.vue` | 抽屉化预览层 | 中 |

## 5. 风险点与控制措施

### 风险 1：`AiInterviewerPanel.vue` 逻辑与样式耦合较深

控制措施：

1. 先只重构壳层和非模拟分支。
2. 模拟面试分支保持原逻辑，不做样式联动改写。

### 风险 2：token 重建可能影响既有模拟面试样式

控制措施：

1. token 命名按浅色工作台和深色模拟区分层。
2. 避免直接覆盖模拟面试现有关键变量。

### 风险 3：页面大改后交互事件回归

控制措施：

1. 保持组件输入输出接口尽量不变。
2. 先改布局，再局部调整交互结构，避免同一轮同时大动逻辑。

### 风险 4：现有工作区本身较脏，容易与其他改动冲突

控制措施：

1. 按文件小步提交。
2. 不触碰无关模块。
3. 每阶段完成后立即做局部验证。

## 6. 验证计划

### 视觉验证

1. 对照全站浅色模块检查主色、圆角、卡片层级是否一致。
2. 检查非模拟面试区是否已形成浅色工作台。
3. 检查模拟面试区是否仍为深色沉浸式。

### 功能验证

1. 岗位准备页可正常输入、解析、复用已有 JD。
2. 专项训练页可正常进入、回答、反馈。
3. 面试复盘页可正常展示诊断内容。
4. 配置层和预览层可正常打开、关闭、切换。

### 交互验证

1. 每页主按钮明确。
2. 空态、加载、错误、完成态均可触达。
3. 抽屉、弹窗和页内展开的行为符合设计预期。

### 响应式验证

1. 1280px+ 桌面布局完整。
2. 1024px 左右平板宽度下主次栏可接受。
3. 小屏下主内容优先，侧栏合理下移或折叠。

## 7. 推荐实施顺序

建议按以下提交粒度推进：

1. 第一次提交：token 与工作台壳层
2. 第二次提交：岗位准备页
3. 第三次提交：专项训练页与面试复盘页
4. 第四次提交：配置层、预览层、状态与响应式收尾

## 8. 完成标准

当以下条件全部满足时，视为本轮重构完成：

1. 非模拟面试界面已完成浅色工作台化。
2. 标题层级、间距、模块与交互规则已统一。
3. 旧的“功能堆叠式布局”已被新的任务工作台结构替代。
4. 模拟面试主战场未被破坏。
5. 视觉上和其他模块保持同一产品体系。

---

**结论**：本计划建议以“基础样式先行、页面分阶段替换、最后统一收口”的方式推进，避免一次性重构导致范围失控，同时确保 AI 面试模块能真正从局部优化升级为一套完整、稳定、可扩展的工作台体验。
