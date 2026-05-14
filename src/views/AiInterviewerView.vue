<script setup lang="ts">
import AiInterviewerPanel from '@/components/ai/interview/AiInterviewerPanel.vue'
</script>

<template>
  <section class="view-workspace interview-workspace">
    <AiInterviewerPanel />
  </section>
</template>

<style scoped>
.view-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
  background: transparent;
}

.interview-workspace {
  border-radius: 0;
}
</style>
