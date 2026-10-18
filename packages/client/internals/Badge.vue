<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    text?: string
    color?: boolean | number
    as?: string
    size?: string
  }>(),
  {
    color: true,
  },
)

// PreMerd: no hashed hues; a "colored" badge is ink on a faint ground
const style = computed(() => {
  if (!props.text || props.color === false)
    return {}
  return {
    color: 'var(--pm-ui-fg)',
    background: 'var(--pm-ui-hover)',
  }
})

const sizeClasses = computed(() => {
  switch (props.size || 'sm') {
    case 'sm':
      return 'px-1.5 text-11px leading-1.6em'
  }
  return ''
})
</script>

<template>
  <component :is="as || 'span'" ws-nowrap rounded-ui :class="sizeClasses" :style>
    <slot>
      <span v-text="props.text" />
    </slot>
  </component>
</template>
