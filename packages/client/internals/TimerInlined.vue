<script setup lang="ts">
import { computed } from 'vue'
import { useTimer } from '../composables/useTimer'

const { status, percentage, mode, timer, reset, toggle } = useTimer()

const color = computed(() => {
  if (status.value === 'stopped')
    return 'op50'
  // PreMerd: lightness rises with elapsed time; only overtime is red
  if (status.value === 'paused')
    return 'text-faint'

  if (percentage.value > 100)
    return 'text-error'
  else if (percentage.value > 80)
    return 'text-main font-bold'
  else
    return 'text-muted'
})
</script>

<template>
  <div
    class="group flex items-center justify-center pl-4 select-none"
    :class="color"
  >
    <div class="w-22px cursor-pointer">
      <div
        class="group-hover:hidden text-2xl"
        :class="mode === 'countdown' ? 'i-carbon:timer' : 'i-carbon:time'"
      />
      <div class="group-not-hover:hidden flex flex-col items-center">
        <div class="relative op-80 hover:op-100" @click="toggle">
          <div v-if="status === 'running'" class="i-carbon:pause text-lg" />
          <div v-else class="i-carbon:play" />
        </div>
        <div class="op-80 hover:op-100" @click="reset">
          <div class="i-carbon:renew" />
        </div>
      </div>
    </div>
    <div class="text-3xl px-3 my-auto font-mono">
      <template v-if="timer.h">
        <span>{{ timer.h }}</span>
        <span op50>:</span>
      </template>
      <span>{{ timer.m }}</span>
      <span op50>:</span>
      <span>{{ timer.s }}</span>
    </div>
  </div>
</template>
