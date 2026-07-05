<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ProjectSopDossier, ProjectSopStage } from '@/services/projectSop/types'
import {
  createEmptyProjectSopAction,
  createEmptyProjectSopChallenge,
  createEmptyProjectSopMetric,
} from '@/services/projectSop/validation'

defineOptions({ name: 'ProjectSopDossierForm' })

const props = defineProps<{
  dossier: ProjectSopDossier | null
}>()

const emit = defineEmits<{
  (e: 'update', patch: Partial<ProjectSopDossier>): void
}>()

const draft = ref<ProjectSopDossier | null>(null)

const stageOptions: Array<{ value: ProjectSopStage; label: string }> = [
  { value: 'not_started', label: '未启动' },
  { value: 'in_progress', label: '进行中' },
  { value: 'launched', label: '已上线' },
  { value: 'iterating', label: '迭代中' },
  { value: 'offline', label: '已下线' },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function commit() {
  if (!draft.value) return
  emit('update', clone(draft.value))
}

function addAction() {
  if (!draft.value) return
  draft.value.actions.push(createEmptyProjectSopAction())
  commit()
}

function removeAction(index: number) {
  if (!draft.value || draft.value.actions.length <= 1) return
  draft.value.actions.splice(index, 1)
  commit()
}

function addChallenge() {
  if (!draft.value) return
  draft.value.challenges.push(createEmptyProjectSopChallenge())
  commit()
}

function removeChallenge(index: number) {
  if (!draft.value || draft.value.challenges.length <= 1) return
  draft.value.challenges.splice(index, 1)
  commit()
}

function addMetric() {
  if (!draft.value) return
  draft.value.metrics.push(createEmptyProjectSopMetric())
  commit()
}

function removeMetric(index: number) {
  if (!draft.value || draft.value.metrics.length <= 1) return
  draft.value.metrics.splice(index, 1)
  commit()
}

watch(
  () => props.dossier,
  (value) => {
    draft.value = value ? clone(value) : null
  },
  { immediate: true },
)
</script>

<template>
  <section v-if="draft" class="dossier-form">
    <div class="form-section">
      <div class="section-heading">
        <p>基础信息</p>
        <span>项目名称、业务线和当前阶段</span>
      </div>
      <div class="form-grid">
        <label>
          <span>项目名称</span>
          <input v-model="draft.name" type="text" placeholder="例如：智能简历优化平台" @blur="commit" />
        </label>
        <label>
          <span>行业 / 业务线</span>
          <input v-model="draft.industry" type="text" placeholder="例如：招聘 SaaS / 求职工具" @blur="commit" />
        </label>
        <label>
          <span>开始时间</span>
          <input v-model="draft.startDate" type="month" @change="commit" />
        </label>
        <label>
          <span>结束时间</span>
          <input v-model="draft.endDate" type="month" @change="commit" />
        </label>
        <label>
          <span>项目阶段</span>
          <select v-model="draft.stage" @change="commit">
            <option v-for="option in stageOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label>
          <span>团队规模</span>
          <input v-model="draft.teamSize" type="text" placeholder="例如：6 人，含产品/前端/后端" @blur="commit" />
        </label>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading">
        <p>个人角色</p>
        <span>明确我的贡献边界</span>
      </div>
      <div class="form-grid">
        <label>
          <span>我的角色</span>
          <input v-model="draft.role" type="text" placeholder="例如：产品负责人 / 后端开发" @blur="commit" />
        </label>
        <label>
          <span>协作对象</span>
          <input v-model="draft.collaborationObjects" type="text" placeholder="例如：设计、算法、业务运营" @blur="commit" />
        </label>
        <label class="span-2">
          <span>核心权责</span>
          <textarea v-model="draft.responsibilities" rows="3" placeholder="我负责哪些模块、决策或验收工作" @blur="commit"></textarea>
        </label>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading">
        <p>背景目标</p>
        <span>回答为什么做</span>
      </div>
      <div class="form-grid">
        <label class="span-2">
          <span>项目背景</span>
          <textarea v-model="draft.background" rows="3" placeholder="行业、业务阶段、团队现状" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>核心痛点</span>
          <textarea v-model="draft.painPoints" rows="3" placeholder="具体、可量化的用户/业务/效率痛点" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>痛点影响</span>
          <textarea v-model="draft.painImpact" rows="2" placeholder="不解决会带来什么损失" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>项目目标</span>
          <textarea v-model="draft.goals" rows="2" placeholder="项目立项时的核心目标或指标" @blur="commit"></textarea>
        </label>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading inline-heading">
        <div>
          <p>执行动作</p>
          <span>至少补充两个关键动作</span>
        </div>
        <button type="button" @click="addAction">添加动作</button>
      </div>
      <div class="repeat-list">
        <article v-for="(action, index) in draft.actions" :key="action.id" class="repeat-item">
          <div class="repeat-header">
            <strong>动作 {{ index + 1 }}</strong>
            <button type="button" :disabled="draft.actions.length <= 1" @click="removeAction(index)">删除</button>
          </div>
          <div class="form-grid">
            <label>
              <span>动作标题</span>
              <input v-model="action.title" type="text" placeholder="例如：重构信息采集流程" @blur="commit" />
            </label>
            <label>
              <span>负责人</span>
              <input v-model="action.owner" type="text" placeholder="例如：我主导" @blur="commit" />
            </label>
            <label class="span-2">
              <span>执行描述</span>
              <textarea v-model="action.description" rows="2" placeholder="具体怎么做的" @blur="commit"></textarea>
            </label>
            <label>
              <span>输入</span>
              <input v-model="action.input" type="text" placeholder="前置资料/需求/资源" @blur="commit" />
            </label>
            <label>
              <span>输出</span>
              <input v-model="action.output" type="text" placeholder="交付物/结果" @blur="commit" />
            </label>
            <label class="span-2">
              <span>验收标准</span>
              <input v-model="action.acceptance" type="text" placeholder="如何判断完成" @blur="commit" />
            </label>
          </div>
        </article>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading">
        <p>关键决策</p>
        <span>方案选择和判断依据</span>
      </div>
      <label class="block-label">
        <span>关键决策点</span>
        <textarea v-model="draft.keyDecisions" rows="3" placeholder="为什么选这个方案，有没有备选，对比依据是什么" @blur="commit"></textarea>
      </label>
    </div>

    <div class="form-section">
      <div class="section-heading inline-heading">
        <div>
          <p>难点方案</p>
          <span>建议至少 1 个业务/逻辑难点 + 1 个执行/协作难点</span>
        </div>
        <button type="button" @click="addChallenge">添加难点</button>
      </div>
      <div class="repeat-list">
        <article v-for="(challenge, index) in draft.challenges" :key="challenge.id" class="repeat-item">
          <div class="repeat-header">
            <strong>难点 {{ index + 1 }}</strong>
            <button type="button" :disabled="draft.challenges.length <= 1" @click="removeChallenge(index)">删除</button>
          </div>
          <div class="form-grid">
            <label>
              <span>类型</span>
              <select v-model="challenge.type" @change="commit">
                <option value="business_logic">业务/逻辑</option>
                <option value="execution_collaboration">执行/协作</option>
                <option value="technical">技术</option>
                <option value="resource">资源</option>
              </select>
            </label>
            <label>
              <span>问题</span>
              <input v-model="challenge.problem" type="text" placeholder="具体问题是什么" @blur="commit" />
            </label>
            <label class="span-2">
              <span>根因分析</span>
              <textarea v-model="challenge.rootCause" rows="2" placeholder="为什么会发生" @blur="commit"></textarea>
            </label>
            <label class="span-2">
              <span>解决方案</span>
              <textarea v-model="challenge.solution" rows="2" placeholder="我采取了什么方案和动作" @blur="commit"></textarea>
            </label>
            <label class="span-2">
              <span>结果</span>
              <textarea v-model="challenge.result" rows="2" placeholder="解决后带来了什么变化" @blur="commit"></textarea>
            </label>
          </div>
        </article>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading inline-heading">
        <div>
          <p>结果数据</p>
          <span>数据必须有统计口径，缺失时会生成待补占位符</span>
        </div>
        <button type="button" @click="addMetric">添加指标</button>
      </div>
      <div class="repeat-list">
        <article v-for="(metric, index) in draft.metrics" :key="metric.id" class="repeat-item">
          <div class="repeat-header">
            <strong>指标 {{ index + 1 }}</strong>
            <button type="button" :disabled="draft.metrics.length <= 1" @click="removeMetric(index)">删除</button>
          </div>
          <div class="form-grid">
            <label>
              <span>指标名称</span>
              <input v-model="metric.name" type="text" placeholder="例如：项目梳理耗时" @blur="commit" />
            </label>
            <label>
              <span>测算口径</span>
              <input v-model="metric.measurement" type="text" placeholder="样本量、周期、计算方式" @blur="commit" />
            </label>
            <label>
              <span>上线前</span>
              <input v-model="metric.before" type="text" placeholder="例如：8 小时" @blur="commit" />
            </label>
            <label>
              <span>上线后</span>
              <input v-model="metric.after" type="text" placeholder="例如：1.5 小时" @blur="commit" />
            </label>
            <label class="span-2">
              <span>业务价值</span>
              <textarea v-model="metric.businessValue" rows="2" placeholder="数据背后的提效、增收、降本或复用价值" @blur="commit"></textarea>
            </label>
          </div>
        </article>
      </div>
      <div class="form-grid feedback-grid">
        <label class="span-2">
          <span>业务反馈</span>
          <textarea v-model="draft.businessFeedback" rows="2" placeholder="用户、业务方、团队反馈" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>认可度证据</span>
          <textarea v-model="draft.stakeholderRecognition" rows="2" placeholder="评优、推广、追加资源、复用到其他场景" @blur="commit"></textarea>
        </label>
      </div>
    </div>

    <div class="form-section">
      <div class="section-heading">
        <p>复盘规划</p>
        <span>回答后续怎么做、还有哪些值得做</span>
      </div>
      <div class="form-grid">
        <label class="span-2">
          <span>不足或遗憾</span>
          <textarea v-model="draft.shortcomings" rows="2" placeholder="项目中还可以做得更好的地方" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>短期优化</span>
          <textarea v-model="draft.shortTermPlan" rows="2" placeholder="1-3 个月内可落地的优化" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>长期规划</span>
          <textarea v-model="draft.longTermPlan" rows="2" placeholder="6-12 个月的拓展方向" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>可复用场景</span>
          <textarea v-model="draft.reusableScenarios" rows="2" placeholder="工作汇报、晋升答辩、客户宣讲等" @blur="commit"></textarea>
        </label>
        <label class="span-2">
          <span>补充备注</span>
          <textarea v-model="draft.notes" rows="3" placeholder="其他事实素材、限制或口径说明" @blur="commit"></textarea>
        </label>
      </div>
    </div>
  </section>

  <section v-else class="empty-form">
    <h2>选择或创建项目档案</h2>
    <p>项目 SOP 会基于档案生成，不会凭空补全缺失事实。</p>
  </section>
</template>

<style scoped>
.dossier-form {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.form-section {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading p {
  margin: 0 0 4px;
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-primary);
}

.section-heading span {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.inline-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.inline-heading button,
.repeat-header button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}

.inline-heading button:hover,
.repeat-header button:hover:not(:disabled) {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

.repeat-header button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

label,
.block-label {
  display: grid;
  gap: 6px;
}

label span,
.block-label span {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font: inherit;
}

input,
select {
  height: 36px;
  padding: 0 10px;
}

textarea {
  min-height: 72px;
  padding: 10px;
  resize: vertical;
  line-height: 1.55;
}

input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--primary-200);
  border-color: var(--primary-400);
}

.span-2 {
  grid-column: 1 / -1;
}

.repeat-list {
  display: grid;
  gap: 12px;
}

.repeat-item {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.repeat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.repeat-header strong {
  font-size: 0.86rem;
  color: var(--text-primary);
}

.feedback-grid {
  margin-top: 12px;
}

.empty-form {
  display: grid;
  place-content: center;
  gap: 8px;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-form h2 {
  margin: 0;
  color: var(--text-primary);
}

.empty-form p {
  margin: 0;
}

@media (max-width: 820px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
