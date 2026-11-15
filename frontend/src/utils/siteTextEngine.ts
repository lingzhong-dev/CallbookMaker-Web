import type { SiteCopyEntry, SiteEditTarget } from '../stores/siteEditStore'

export interface SiteTextHit extends SiteEditTarget {
  textNode: Text
}

export interface SiteTextEngineOptions {
  rootEl: HTMLElement
  getRoute: () => string
  getEntries: () => Record<string, SiteCopyEntry>
  isEditMode: () => boolean
  onHoverChange: (hit: SiteTextHit | null) => void
  onEditSelect: (hit: SiteTextHit) => void
}

const EXCLUDED_ANCESTOR_SELECTOR =
  '[data-site-edit-ui], [data-no-site-edit], ruby, rt, rp, svg, script, style, noscript, input, textarea, select, option, code, pre'

const INTERACTIVE_WRAPPER_SELECTOR = 'button, a, label, [role="button"], h1, h2, h3, h4, h5, h6'

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function isDynamicClockOrCounter(text: string): boolean {
  const trimmed = text.trim()
  if (/^\d{2}:\d{2}(?:\.\d{2})?$/.test(trimmed)) return true
  if (/^\d+\.\d$/.test(trimmed)) return true
  return false
}

function preserveOuterWhitespace(rawTemplate: string, nextTrimmed: string): string {
  const leadingMatch = rawTemplate.match(/^\s*/)
  const trailingMatch = rawTemplate.match(/\s*$/)
  const leading = leadingMatch ? leadingMatch[0] : ''
  const trailing = trailingMatch ? trailingMatch[0] : ''
  return `${leading}${nextTrimmed}${trailing}`
}

function resolveScope(el: Element, currentRoute: string): string {
  const explicit = el.closest('[data-edit-scope]')
  if (explicit) {
    const scopeName = explicit.getAttribute('data-edit-scope')
    if (scopeName) return scopeName
  }
  if (el.closest('[role="dialog"], [role="alertdialog"]')) return 'modal'
  if (el.closest('aside')) return 'sidebar'
  if (el.closest('header')) return 'header'
  const nav = el.closest('nav[aria-label]')
  if (nav) return `nav:${nav.getAttribute('aria-label') || 'bar'}`
  if (el.closest('#timeline-workspace')) return `${currentRoute}:workspace`
  return `view:${currentRoute}`
}

function isEligibleTextNode(node: Text, ignoreDynamicCheck = false): boolean {
  const parent = node.parentElement
  if (!parent) return false
  if (parent.closest(EXCLUDED_ANCESTOR_SELECTOR)) return false
  const raw = node.nodeValue ?? ''
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (!ignoreDynamicCheck && isDynamicClockOrCounter(trimmed)) return false
  return true
}

function getTextNodeRect(node: Text): DOMRect {
  const range = document.createRange()
  range.selectNodeContents(node)
  const rect = range.getBoundingClientRect()
  if (rect.width > 0 || rect.height > 0) return rect
  return node.parentElement?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0)
}

function pointNearRect(x: number, y: number, rect: DOMRect, pad = 10): boolean {
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  )
}

function distanceToRectSq(x: number, y: number, rect: DOMRect): number {
  const cx = Math.max(rect.left, Math.min(x, rect.right))
  const cy = Math.max(rect.top, Math.min(y, rect.bottom))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy
}

export function createSiteTextEngine(options: SiteTextEngineOptions) {
  const originalRawMap = new WeakMap<Text, string>()
  const lastAppliedRawMap = new WeakMap<Text, string>()
  const computedKeyMap = new WeakMap<Text, { key: string; original: string; scope: string; tagName: string }>()

  let isPatching = false
  let pendingSync = false
  let hoverRafId: number | null = null
  let observer: MutationObserver | null = null

  function collectAndSyncDom(): void {
    if (isPatching) return
    isPatching = true
    try {
      const currentRoute = options.getRoute()
      const entries = options.getEntries()
      const countsBySignature = new Map<string, number>()
      const walker = document.createTreeWalker(options.rootEl, NodeFilter.SHOW_TEXT)

      let node = walker.nextNode() as Text | null
      while (node) {
        const currentlyPatched = lastAppliedRawMap.has(node)
        if (isEligibleTextNode(node, currentlyPatched)) {
          const domRaw = node.nodeValue ?? ''
          let origRaw = originalRawMap.get(node)
          const lastApplied = lastAppliedRawMap.get(node)

          // Record initial source string or accept genuine Vue reactive changes
          if (origRaw === undefined) {
            origRaw = domRaw
            originalRawMap.set(node, origRaw)
          } else if (
            lastApplied !== undefined &&
            domRaw !== lastApplied &&
            domRaw !== origRaw
          ) {
            origRaw = domRaw
            originalRawMap.set(node, origRaw)
            lastAppliedRawMap.delete(node)
          } else if (lastApplied === undefined && domRaw !== origRaw) {
            origRaw = domRaw
            originalRawMap.set(node, origRaw)
          }

          const parent = node.parentElement!
          const origTrimmed = origRaw.trim()
          const scope = resolveScope(parent, currentRoute)
          const tagName = parent.tagName.toLowerCase()
          const baseSig = `${scope}::${tagName}::${fnv1aHex(origTrimmed)}_${origTrimmed.length}`
          const occ = countsBySignature.get(baseSig) ?? 0
          countsBySignature.set(baseSig, occ + 1)
          const key = `${baseSig}::${occ}`

          computedKeyMap.set(node, { key, original: origTrimmed, scope, tagName })

          const override = entries[key]
          if (override && override.original === origTrimmed) {
            const targetRaw = preserveOuterWhitespace(origRaw, override.value)
            if (node.nodeValue !== targetRaw) {
              node.nodeValue = targetRaw
            }
            lastAppliedRawMap.set(node, targetRaw)
          } else if (lastAppliedRawMap.has(node)) {
            if (node.nodeValue !== origRaw) {
              node.nodeValue = origRaw
            }
            lastAppliedRawMap.delete(node)
          }
        }
        node = walker.nextNode() as Text | null
      }
    } finally {
      observer?.takeRecords()
      isPatching = false
    }
  }

  function scheduleSync(): void {
    if (pendingSync) return
    pendingSync = true
    queueMicrotask(() => {
      pendingSync = false
      collectAndSyncDom()
    })
  }

  function buildHitFromTextNode(tn: Text): SiteTextHit | null {
    collectAndSyncDom()
    const meta = computedKeyMap.get(tn)
    if (!meta) return null
    const rect = getTextNodeRect(tn)
    if (rect.width === 0 && rect.height === 0) return null
    return {
      textNode: tn,
      key: meta.key,
      original: meta.original,
      current: (tn.nodeValue ?? '').trim(),
      route: options.getRoute(),
      scope: meta.scope,
      tagName: meta.tagName,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    }
  }

  function findHitAtPoint(target: EventTarget | null, clientX: number, clientY: number): SiteTextHit | null {
    if (!(target instanceof Element)) return null
    if (!options.rootEl.contains(target)) return null
    if (target.closest(EXCLUDED_ANCESTOR_SELECTOR)) return null

    // Search text nodes directly in target first; fall back to closest interactive wrapper
    const directCandidates: Text[] = []
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
    let cur = walker.nextNode() as Text | null
    while (cur) {
      if (isEligibleTextNode(cur, lastAppliedRawMap.has(cur))) {
        directCandidates.push(cur)
      }
      cur = walker.nextNode() as Text | null
    }

    const interactiveAncestor = target.closest(INTERACTIVE_WRAPPER_SELECTOR)
    const searchPool = [...directCandidates]

    if (interactiveAncestor && interactiveAncestor !== target) {
      const wrapWalker = document.createTreeWalker(interactiveAncestor, NodeFilter.SHOW_TEXT)
      let wrapNode = wrapWalker.nextNode() as Text | null
      while (wrapNode) {
        if (
          isEligibleTextNode(wrapNode, lastAppliedRawMap.has(wrapNode)) &&
          !searchPool.includes(wrapNode)
        ) {
          searchPool.push(wrapNode)
        }
        wrapNode = wrapWalker.nextNode() as Text | null
      }
    }

    if (searchPool.length === 0) return null

    // Find best matching text node under pointer
    let bestNode: Text | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const candidate of searchPool) {
      const rect = getTextNodeRect(candidate)
      if (rect.width === 0 && rect.height === 0) continue
      const insideDirectParent = candidate.parentElement === target
      const dist = distanceToRectSq(clientX, clientY, rect)
      if (
        pointNearRect(clientX, clientY, rect, insideDirectParent ? 24 : 10) ||
        (interactiveAncestor && searchPool.length <= 2)
      ) {
        if (dist < bestDist) {
          bestDist = dist
          bestNode = candidate
        }
      }
    }

    if (!bestNode) return null
    return buildHitFromTextNode(bestNode)
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!options.isEditMode()) return
    if (hoverRafId !== null) cancelAnimationFrame(hoverRafId)
    const { target, clientX, clientY } = e
    hoverRafId = requestAnimationFrame(() => {
      hoverRafId = null
      if (!options.isEditMode()) {
        options.onHoverChange(null)
        return
      }
      options.onHoverChange(findHitAtPoint(target, clientX, clientY))
    })
  }

  function handleDocumentClick(e: MouseEvent): void {
    if (!options.isEditMode()) return
    if (!(e.target instanceof Element)) return
    if (e.target.closest('[data-site-edit-ui]')) return

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    const hit = findHitAtPoint(e.target, e.clientX, e.clientY)
    if (hit) {
      options.onEditSelect(hit)
    }
  }

  function handleKeyBlock(e: KeyboardEvent): void {
    if (!options.isEditMode()) return
    if (e.target instanceof Element && e.target.closest('[data-site-edit-ui]')) return
    // Prevent Space/F/G/1-8 stage shortcuts from firing while inspecting page copy
    if (['Space', ' ', 'f', 'F', 'g', 'G'].includes(e.key)) {
      e.stopPropagation()
    }
  }

  function start(): () => void {
    collectAndSyncDom()

    observer = new MutationObserver(() => {
      if (!isPatching) scheduleSync()
    })
    observer.observe(options.rootEl, {
      childList: true,
      subtree: true,
      characterData: true
    })

    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('click', handleDocumentClick, true)
    document.addEventListener('keydown', handleKeyBlock, true)

    return () => {
      observer?.disconnect()
      observer = null
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('click', handleDocumentClick, true)
      document.removeEventListener('keydown', handleKeyBlock, true)
    }
  }

  return {
    start,
    syncNow: collectAndSyncDom
  }
}
