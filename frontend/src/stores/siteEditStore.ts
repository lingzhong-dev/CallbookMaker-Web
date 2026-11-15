import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bundledOverridesRaw from '../data/siteCopyOverrides.json'
import {
  fetchSiteCopyApi,
  resetSiteCopyApi,
  saveSiteCopyApi,
  type SiteCopyEntryPayload
} from '../api/client'
import { useCallbookStore } from './callbookStore'

export type SiteCopyEntry = SiteCopyEntryPayload

export interface EditTargetRect {
  top: number
  left: number
  width: number
  height: number
}

export interface SiteEditTarget {
  key: string
  original: string
  current: string
  route: string
  scope: string
  tagName: string
  rect: EditTargetRect
}

const STORAGE_ENTRIES_KEY = 'livecall_site_copy_overrides_v1'
const STORAGE_META_KEY = 'livecall_site_copy_meta_v1'

interface StoredMeta {
  dirty: boolean
  lastSyncedAt: string
}

function cloneEntries(
  raw: Record<string, SiteCopyEntry> | undefined | null
): Record<string, SiteCopyEntry> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, SiteCopyEntry> = {}
  for (const [k, item] of Object.entries(raw)) {
    if (!item || typeof item.original !== 'string' || typeof item.value !== 'string') continue
    if (item.value === item.original) continue
    const key = item.key || k
    out[key] = {
      key,
      original: item.original,
      value: item.value,
      route: item.route || 'global',
      updatedAt: item.updatedAt || ''
    }
  }
  return out
}

function readLocalMeta(): StoredMeta {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY)
    if (!raw) return { dirty: false, lastSyncedAt: '' }
    const parsed = JSON.parse(raw) as Partial<StoredMeta>
    return {
      dirty: Boolean(parsed.dirty),
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : ''
    }
  } catch {
    return { dirty: false, lastSyncedAt: '' }
  }
}

function readLocalEntries(): Record<string, SiteCopyEntry> | null {
  try {
    const raw = localStorage.getItem(STORAGE_ENTRIES_KEY)
    if (!raw) return null
    return cloneEntries(JSON.parse(raw) as Record<string, SiteCopyEntry>)
  } catch {
    return null
  }
}

function entriesEqual(
  a: Record<string, SiteCopyEntry>,
  b: Record<string, SiteCopyEntry>
): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!b[k]) return false
    if (a[k].value !== b[k].value || a[k].original !== b[k].original) return false
  }
  return true
}

function detectInitialEditMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('edit') === '1' || params.get('edit') === 'true' || window.location.hash === '#edit'
}

export const useSiteEditStore = defineStore('siteEdit', () => {
  const bundled = cloneEntries(
    (bundledOverridesRaw as { entries?: Record<string, SiteCopyEntry> })?.entries
  )
  const localInitial = readLocalEntries()
  const metaInitial = readLocalMeta()

  const isEditMode = ref<boolean>(detectInitialEditMode())
  const showManagerModal = ref<boolean>(false)
  const syncing = ref<boolean>(false)
  const lastSyncedAt = ref<string>(metaInitial.lastSyncedAt)
  const serverEntries = ref<Record<string, SiteCopyEntry>>(cloneEntries(bundled))
  const entries = ref<Record<string, SiteCopyEntry>>(
    localInitial !== null && (metaInitial.dirty || Object.keys(localInitial).length > 0)
      ? localInitial
      : cloneEntries(bundled)
  )

  const hoveredTarget = ref<SiteEditTarget | null>(null)
  const activeTarget = ref<SiteEditTarget | null>(null)

  const entriesList = computed(() =>
    Object.values(entries.value).sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    )
  )

  const overrideCount = computed(() => entriesList.value.length)

  const hasUnsyncedChanges = computed(
    () => !entriesEqual(entries.value, serverEntries.value)
  )

  function persistLocal(): void {
    try {
      localStorage.setItem(STORAGE_ENTRIES_KEY, JSON.stringify(entries.value))
      const meta: StoredMeta = {
        dirty: hasUnsyncedChanges.value,
        lastSyncedAt: lastSyncedAt.value
      }
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta))
    } catch {
      // Ignore quota issues cleanly
    }
  }

  function toggleEditMode(force?: boolean): void {
    const next = typeof force === 'boolean' ? force : !isEditMode.value
    isEditMode.value = next
    if (!next) {
      hoveredTarget.value = null
      activeTarget.value = null
    }
  }

  function setOverride(
    key: string,
    original: string,
    nextValue: string,
    route = 'global'
  ): void {
    const trimmedOriginal = original.trim()
    const trimmedValue = nextValue.trim()
    const next = { ...entries.value }

    if (!trimmedValue || trimmedValue === trimmedOriginal) {
      delete next[key]
    } else {
      next[key] = {
        key,
        original: trimmedOriginal,
        value: trimmedValue,
        route,
        updatedAt: new Date().toISOString()
      }
    }

    entries.value = next
    persistLocal()
  }

  function removeOverride(key: string): void {
    if (!entries.value[key]) return
    const next = { ...entries.value }
    delete next[key]
    entries.value = next
    persistLocal()
  }

  async function hydrateFromBackend(): Promise<void> {
    try {
      const doc = await fetchSiteCopyApi()
      const remote = cloneEntries(doc.entries)
      serverEntries.value = remote
      lastSyncedAt.value = doc.updatedAt || ''

      const localMeta = readLocalMeta()
      // Adopt server state when local has no pending unsaved drafts
      if (!localMeta.dirty) {
        entries.value = cloneEntries(remote)
      }
      persistLocal()
    } catch {
      // Keep local/bundled overrides offline without disrupting UI
    }
  }

  async function persistToProject(): Promise<boolean> {
    const callbook = useCallbookStore()
    syncing.value = true
    try {
      const res = await saveSiteCopyApi(entries.value)
      const normalized = cloneEntries(res.entries)
      entries.value = normalized
      serverEntries.value = cloneEntries(normalized)
      lastSyncedAt.value = res.updatedAt || new Date().toISOString()
      persistLocal()
      callbook.setStatus(
        res.projectSynced
          ? `已将 ${res.savedCount} 处文字修改写回项目与服务端持久化`
          : `已在服务端保存 ${res.savedCount} 处文字修改`
      )
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : '服务端连接不可用'
      callbook.setStatus(`当前已保存在浏览器本地；服务端写回失败：${msg}`)
      return false
    } finally {
      syncing.value = false
    }
  }

  async function resetAllToDefault(): Promise<void> {
    const callbook = useCallbookStore()
    entries.value = {}
    activeTarget.value = null
    hoveredTarget.value = null
    syncing.value = true
    try {
      const res = await resetSiteCopyApi()
      serverEntries.value = {}
      lastSyncedAt.value = res.updatedAt || ''
      persistLocal()
      callbook.setStatus('已恢复网站默认文字并清空服务端持久化覆盖')
    } catch {
      persistLocal()
      callbook.setStatus('已清空浏览器本地文案修改并恢复当前页面默认文字')
    } finally {
      syncing.value = false
    }
  }

  function exportOverridesJson(): string {
    return JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: entries.value
      },
      null,
      2
    )
  }

  function importOverridesJson(rawText: string): number {
    const parsed = JSON.parse(rawText) as { entries?: Record<string, SiteCopyEntry> } | Record<string, SiteCopyEntry>
    const source =
      parsed && typeof parsed === 'object' && 'entries' in parsed && parsed.entries
        ? (parsed.entries as Record<string, SiteCopyEntry>)
        : (parsed as Record<string, SiteCopyEntry>)
    const normalized = cloneEntries(source)
    entries.value = normalized
    persistLocal()
    return Object.keys(normalized).length
  }

  return {
    isEditMode,
    showManagerModal,
    syncing,
    lastSyncedAt,
    entries,
    serverEntries,
    entriesList,
    overrideCount,
    hasUnsyncedChanges,
    hoveredTarget,
    activeTarget,
    toggleEditMode,
    setOverride,
    removeOverride,
    hydrateFromBackend,
    persistToProject,
    resetAllToDefault,
    exportOverridesJson,
    importOverridesJson
  }
})
