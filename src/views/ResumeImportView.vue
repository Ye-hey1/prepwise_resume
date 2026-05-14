<script setup lang="ts">
import ResumeImportPanel from '@/components/resume/ResumeImportPanel.vue'
</script>

<template>
  <section class="view-workspace import-workspace">
    <ResumeImportPanel />
  </section>
</template>

<style scoped>
.view-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  padding: 14px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-card-muted));
}

.import-workspace {
  border-radius: calc(var(--radius-xl) + 4px);
}
</style>
