<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch, watchEffect } from 'vue'
import { useMousePosInSlide } from '../composables/useMousePosInSlide'
import { useNav } from '../composables/useNav'
import { cursorStyle } from '../state'
import { sharedState } from '../state/shared'

const selfMouse = useMousePosInSlide()
const { isPresenter } = useNav()

// The pointer to draw: the presenter's (synced) on viewers, our own when this window uses laser/trail
const pointer = computed(() => {
  const remote = sharedState.cursor
  if (!isPresenter.value && remote && (remote.style === 'laser' || remote.style === 'trail'))
    return { x: remote.x, y: remote.y, style: remote.style }
  if ((cursorStyle.value === 'laser' || cursorStyle.value === 'trail') && selfMouse.value)
    return { x: selfMouse.value.x, y: selfMouse.value.y, style: cursorStyle.value }
  return null
})

// ---- trail: recent positions, faded out by age ----

const TRAIL_LIFE = 800 // ms
interface TrailPoint { x: number, y: number, t: number, breakBefore: boolean }
const points: TrailPoint[] = []
const segments = shallowRef<{ x1: number, y1: number, x2: number, y2: number, opacity: number }[]>([])
let raf = 0
let lastWasNull = true

function tick() {
  const now = performance.now()
  while (points.length && now - points[0].t > TRAIL_LIFE)
    points.shift()
  const next = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (b.breakBefore)
      continue
    next.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity: Math.max(0, 1 - (now - b.t) / TRAIL_LIFE) })
  }
  segments.value = next
  raf = points.length ? requestAnimationFrame(tick) : 0
}

watch(pointer, (p) => {
  if (!p || p.style !== 'trail') {
    lastWasNull = true
    return
  }
  points.push({ x: p.x, y: p.y, t: performance.now(), breakBefore: lastWasNull })
  lastWasNull = false
  if (!raf)
    raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => cancelAnimationFrame(raf))

onMounted(() => {
  watchEffect(() => {
    const own = (cursorStyle.value === 'laser' || cursorStyle.value === 'trail') && !!pointer.value
    document.body.classList.toggle('slidev-self-laser-active', own)
  })
})
</script>

<template>
  <div class="absolute top-0 left-0 right-0 bottom-0 pointer-events-none text-xl">
    <svg
      v-if="segments.length"
      class="absolute inset-0 w-full h-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        v-for="(s, i) in segments"
        :key="i"
        class="trail-segment"
        :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
        :stroke-opacity="s.opacity"
      />
    </svg>
    <div
      v-if="pointer"
      class="laser-pointer"
      :style="{
        left: `${pointer.x}%`,
        top: `${pointer.y}%`,
      }"
    />
  </div>
</template>

<style scoped>
.laser-pointer {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle at center,
    rgba(255, 80, 80, 1) 0%,
    rgba(255, 0, 0, 0.95) 55%,
    rgba(255, 0, 0, 0.1) 100%
  );
  box-shadow:
    0 0 10px rgba(255, 0, 0, 0.9),
    0 0 22px rgba(255, 0, 0, 0.55);
}

.trail-segment {
  stroke: rgb(255, 30, 30);
  stroke-width: 4px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
</style>

<style>
.slidev-self-laser-active .slidev-slide-container {
  cursor: none;
}
</style>
