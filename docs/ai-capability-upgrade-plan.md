# AI 能力升级实施计划

## 目标

把当前分散在简历编辑、JD 分析、AI 面试里的模型调用，升级为可观测、可校验、可持续迭代的 AI 任务系统。第一阶段以不改变用户可见行为为边界，先增强底座，再逐步推进简历补丁化、JD artifact 化和面试智能体拆分。

## 阶段 1：AI 任务运行时

- 为结构化输出建立统一入口：prompt 类别、prompt 版本、模型、耗时、解析状态、修复次数都进入本地运行日志。
- 统一 JSON 清洗、解析、schema/normalizer 校验和失败修复流程。
- 先接入简历审查与 JD 匹配，作为后续模块迁移样板。

## 阶段 2：简历编辑补丁化

- 将“优化后文本”升级为结构化 `ResumePatch`。
- 每个补丁记录修改位置、原文、新文、修改理由、风险等级、证据来源。
- 对可能虚构的数据或指标标注“需要用户确认”，避免直接写入。

## 阶段 3：JD 分析 artifact 化

- 沉淀 `JobTargetProfile`：岗位职责、硬性要求、软性要求、隐含偏好、业务场景。
- 沉淀 `CandidateFitGraph`：岗位要求到简历证据、缺口、行动建议和面试问题的映射。
- 支持 JD/简历变更后的分析 diff。

## 阶段 4：AI 面试智能体拆分

- 拆分 Interviewer、Evaluator、Coach、Memory、Training Planner。
- 面试题绑定 requirementId、resumeEvidenceId、rubricDimension。
- 面试后的弱点增量反哺 JD 分析和简历补丁。

## 阶段 5：机会工作台闭环

- 以目标岗位为维度组织 JD、简历版本、匹配分析、审查结果、面试记录和补丁历史。
- 形成“导入 JD -> 匹配 -> 优化 -> 面试 -> 反哺 -> 再匹配”的闭环。

## 验证策略

- 每阶段至少运行 `npm run type-check` 与 `npm run build`。
- 结构化输出改造优先加 normalizer/validator，避免直接信任模型字段。
- 用户可见行为变更必须通过最小回归场景验证。
