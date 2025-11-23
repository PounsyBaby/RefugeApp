<script setup lang="ts">
import { onMounted } from 'vue';
import { useTheme } from './composables/theme';

const theme = useTheme();

onMounted(() => {
  theme.init();
});
</script>

<template>
  <router-view />
</template>
