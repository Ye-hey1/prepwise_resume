import re

filepath = r'c:\Users\colin\Desktop\AI demo\resume-builder\src\components\ai\interview\JdAnalysisStage.vue'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 在 script 中添加 showResultModal
if 'const showResultModal' not in content:
    content = content.replace('const emit = defineEmits<{', 'const showResultModal = ref(false)\n\nconst emit = defineEmits<{')

# 2. 在 guide-card--status 中加按钮
old_status = """          <section class="guide-card guide-card--status">
            <span class="guide-label">当前状态</span>
            <strong>{{ statusTitle }}</strong>
            <p>{{ statusText }}</p>
          </section>"""
new_status = """          <section class="guide-card guide-card--status">
            <span class="guide-label">当前状态</span>
            <strong>{{ statusTitle }}</strong>
            <p>{{ statusText }}</p>
            <button
              v-if="hasAnalysis"
              class="btn-primary"
              style="margin-top: 16px; width: 100%; border-radius: 10px; padding: 12px; border: none; font-size: 14px; font-weight: bold; cursor: pointer;"
              @click="showResultModal = true"
            >
              查看深度分析报告
            </button>
          </section>"""
content = content.replace(old_status, new_status)

# 3. 将 results-shell 用 Modal 包裹
old_results_shell = """    <section v-if="hasAnalysis" class="results-shell">"""
new_results_shell = """    <!-- 分析结果弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showResultModal" class="result-modal-overlay" @click="showResultModal = false">
          <div class="result-modal-container" @click.stop>
            <header class="rm-header">
              <h3>岗位深度分析报告</h3>
              <button class="rm-close" @click="showResultModal = false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>
            <div class="rm-body">
              <section class="results-shell">"""

content = content.replace(old_results_shell, new_results_shell)

old_footer = """      </div>
    </section>
  </section>
</template>"""

new_footer = """      </div>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>"""
content = content.replace(old_footer, new_footer)

# 4. 添加 Modal CSS
modal_css = """
/* 分析结果弹窗 */
.result-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.result-modal-container {
  background: #f4f7f9;
  width: 100%;
  max-width: 1100px;
  max-height: 85vh;
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.5);
}
.rm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: #fff;
  border-bottom: 1px solid rgba(43, 123, 184, 0.1);
  flex-shrink: 0;
}
.rm-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}
.rm-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rm-close:hover {
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-primary);
}
.rm-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(10px);
}
"""
if ".result-modal-overlay" not in content:
    content = content.replace("</style>", modal_css + "\n</style>")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
