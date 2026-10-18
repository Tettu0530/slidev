/**
 * Fast tooltips for the UI chrome (PreMerd).
 *
 * Native `title` tooltips appear after about a second. For every chrome element with
 * a `title`, the text is moved to `data-pm-title` on hover/focus and shown in one shared
 * tooltip after a short delay (immediately when moving between controls).
 * Slide content is left alone.
 */

const SHOW_DELAY = 150
const GAP = 8
const EDGE = 8

let installed = false

export function installTooltips() {
  if (installed || typeof document === 'undefined')
    return
  installed = true

  const tip = document.createElement('div')
  tip.className = 'pm-tooltip'
  tip.id = 'pm-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)

  let current: Element | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastHidden = 0

  // The nav can live inside .slidev-slide-container (play mode); only the slide content is excluded
  const isSlideContent = (el: Element) => !!el.closest('.slidev-slide-content, .slidev-page')

  // Move `title` to `data-pm-title` so the native tooltip never shows
  function adopt(el: Element) {
    const title = el.getAttribute('title')
    if (title == null)
      return
    el.setAttribute('data-pm-title', title)
    el.removeAttribute('title')
    if (!el.hasAttribute('aria-label') && !el.textContent?.trim())
      el.setAttribute('aria-label', title)
  }

  function findTarget(node: EventTarget | null) {
    if (!(node instanceof Element))
      return null
    const el = node.closest('[title], [data-pm-title]')
    if (!el || isSlideContent(el))
      return null
    adopt(el)
    return el.getAttribute('data-pm-title') ? el : null
  }

  function place(el: Element) {
    const text = el.getAttribute('data-pm-title') ?? ''
    if (!text)
      return hide()
    tip.textContent = text
    tip.hidden = false
    el.setAttribute('aria-describedby', tip.id)
    const r = el.getBoundingClientRect()
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    let top = r.top - GAP - h
    if (top < EDGE)
      top = r.bottom + GAP
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), window.innerWidth - w - EDGE)
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  function show(el: Element) {
    clearTimeout(timer)
    current = el
    // Moving from one control to the next: no delay
    const delay = Date.now() - lastHidden < 300 || !tip.hidden ? 0 : SHOW_DELAY
    timer = setTimeout(() => current === el && place(el), delay)
  }

  function hide() {
    clearTimeout(timer)
    if (!tip.hidden)
      lastHidden = Date.now()
    current?.removeAttribute('aria-describedby')
    current = null
    tip.hidden = true
  }

  document.addEventListener('pointerover', (e) => {
    const el = findTarget(e.target)
    if (el === current)
      return
    if (el)
      show(el)
    else
      hide()
  })
  document.addEventListener('focusin', (e) => {
    const el = findTarget(e.target)
    if (el && (el as HTMLElement).matches(':focus-visible'))
      show(el)
  })
  document.addEventListener('focusout', hide)
  document.addEventListener('pointerdown', () => {
    const el = current
    hide()
    // A click may re-render the title (e.g. "Show …" → "Hide …"); adopt it again
    if (el)
      setTimeout(adopt, 0, el)
  }, true)
  document.addEventListener('keydown', e => e.key === 'Escape' && hide())
  window.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)
}
