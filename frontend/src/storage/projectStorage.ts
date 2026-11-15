import type {
  ArchiveSessionState,
  CallPreset,
  CallProject,
  CallbookArchiveEntry,
  DisplayLayers,
  GtAlert,
  LyricLine
} from '../types/callbook'

const DB_NAME = 'live-call-editor-db'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const LS_FALLBACK_KEY = 'live_call_editor_state_v1'
const ARCHIVE_DB_NAME = 'live-call-archives-db'
const ARCHIVE_DB_VERSION = 1
const ARCHIVE_STORE_NAME = 'archive_kv'
const LS_ARCHIVES_KEY = 'live_call_editor_archives_v1'
const LS_ARCHIVE_SESSION_KEY = 'live_call_editor_archive_session_v1'

export interface PersistedWorkspace {
  project: CallProject
  customPresets: CallPreset[]
  displayLayers: DisplayLayers
  savedAt: number
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null)
      return
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

export async function saveWorkspaceState(data: PersistedWorkspace): Promise<void> {
  const serialized = JSON.parse(JSON.stringify(data)) as PersistedWorkspace
  try {
    window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(serialized))
  } catch {
    // Ignore localStorage quota issues
  }

  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(serialized, 'current')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      resolve()
    }
  })
}

export async function loadWorkspaceState(): Promise<PersistedWorkspace | null> {
  const db = await openDatabase()
  if (db) {
    const fromIdb = await new Promise<PersistedWorkspace | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get('current')
      req.onsuccess = () => {
        db.close()
        resolve((req.result as PersistedWorkspace) || null)
      }
      req.onerror = () => {
        db.close()
        resolve(null)
      }
    })
    if (fromIdb?.project?.meta && Array.isArray(fromIdb.project.lines)) {
      return {
        ...fromIdb,
        project: normalizeCallProject(fromIdb.project)
      }
    }
  }

  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedWorkspace
    if (parsed?.project?.meta && Array.isArray(parsed.project.lines)) {
      return {
        ...parsed,
        project: normalizeCallProject(parsed.project)
      }
    }
  } catch {
    return null
  }
  return null
}

/** Resolve which lyric line a GT alert targets, falling back to nearest line for legacy alerts. */
export function resolveAlertTargetLineId(
  alert: GtAlert,
  sortedLines: LyricLine[],
  claimedLineIds?: Set<string>
): string | undefined {
  if (alert.targetLineId && sortedLines.some((l) => l.id === alert.targetLineId)) {
    return alert.targetLineId
  }
  if (sortedLines.length === 0) return undefined

  const candidates =
    claimedLineIds && claimedLineIds.size < sortedLines.length
      ? sortedLines.filter((l) => !claimedLineIds.has(l.id))
      : sortedLines

  const exact = candidates.find((l) => l.startTimeMs === alert.triggerTimeMs)
  if (exact) return exact.id

  const containing = candidates.find(
    (l) => alert.triggerTimeMs >= l.startTimeMs && alert.triggerTimeMs < l.endTimeMs
  )
  if (containing) return containing.id

  let bestLine = candidates[0]
  let bestDist = Math.abs(bestLine.startTimeMs - alert.triggerTimeMs)
  for (let i = 1; i < candidates.length; i++) {
    const line = candidates[i]
    const dist = Math.abs(line.startTimeMs - alert.triggerTimeMs)
    if (
      dist < bestDist ||
      (dist === bestDist && line.startTimeMs >= alert.triggerTimeMs && bestLine.startTimeMs < alert.triggerTimeMs)
    ) {
      bestDist = dist
      bestLine = line
    }
  }
  return bestLine.id
}

/** Fill missing schema fields and bind legacy GT alerts to lyric lines on load/import. */
export function normalizeCallProject(raw: CallProject): CallProject {
  const meta = raw.meta
  const tuner = typeof meta.tuner === 'string' ? meta.tuner : ''
  const showTuner = typeof meta.showTuner === 'boolean' ? meta.showTuner : tuner.trim().length > 0
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map((line) => ({
        ...line,
        kind: line.kind ?? 'lyric',
        tailUpdraft: Boolean(line.tailUpdraft)
      }))
    : []
  const sortedLines = [...lines].sort((a, b) => a.startTimeMs - b.startTimeMs)
  const rawAlerts = Array.isArray(raw.alerts) ? raw.alerts : []

  const claimed = new Set<string>()
  for (const a of rawAlerts) {
    if (a.targetLineId && sortedLines.some((l) => l.id === a.targetLineId)) {
      claimed.add(a.targetLineId)
    }
  }

  const alerts: GtAlert[] = rawAlerts
    .map((alert) => {
      const targetLineId = resolveAlertTargetLineId(alert, sortedLines, claimed)
      if (targetLineId) claimed.add(targetLineId)
      return {
        ...alert,
        leadBeats: typeof alert.leadBeats === 'number' && alert.leadBeats > 0 ? alert.leadBeats : 4,
        note: typeof alert.note === 'string' ? alert.note : '',
        targetLineId,
        callTimingCue: typeof alert.callTimingCue === 'string' ? alert.callTimingCue : ''
      }
    })
    .sort((a, b) => a.triggerTimeMs - b.triggerTimeMs)

  return {
    meta: {
      ...meta,
      composer: typeof meta.composer === 'string' ? meta.composer : '',
      lyricist: typeof meta.lyricist === 'string' ? meta.lyricist : '',
      vocalist: typeof meta.vocalist === 'string' ? meta.vocalist : '',
      tuner,
      showTuner,
      editorName: typeof meta.editorName === 'string' ? meta.editorName : '',
      editorNote: typeof meta.editorNote === 'string' ? meta.editorNote : ''
    },
    alerts,
    lines
  }
}

export function sanitizeProjectForJsonExport(project: CallProject): CallProject {
  const clone = JSON.parse(JSON.stringify(project)) as CallProject
  // Blob URLs are ephemeral per browser tab session; clear them in exported JSON
  if (clone.meta.audioUrl.startsWith('blob:')) {
    clone.meta.audioUrl = ''
  }
  return clone
}

function openArchiveDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(ARCHIVE_STORE_NAME)) {
          db.createObjectStore(ARCHIVE_STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbArchiveGet<T>(key: string): Promise<T | null> {
  const db = await openArchiveDatabase()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ARCHIVE_STORE_NAME, 'readonly')
      const store = tx.objectStore(ARCHIVE_STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        resolve((req.result as T | undefined) ?? null)
      }
      req.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
    } catch {
      db.close()
      resolve(null)
    }
  })
}

async function idbArchivePut<T>(key: string, value: T): Promise<void> {
  const db = await openArchiveDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(ARCHIVE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(ARCHIVE_STORE_NAME)
      store.put(JSON.parse(JSON.stringify(value)), key)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    } catch {
      db.close()
      resolve()
    }
  })
}

export function normalizeArchiveEntry(raw: CallbookArchiveEntry): CallbookArchiveEntry {
  const project = normalizeCallProject(raw.project)
  const taggedCount = project.lines.filter(
    (l) => l.calls.length > 0 || Boolean(l.customShout?.trim()) || Boolean(l.tailUpdraft)
  ).length
  return {
    id: String(raw.id || `archive-${Date.now()}`),
    name: String(raw.name || project.meta.title || '未命名 Call 本'),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now(),
    project,
    customPresets: Array.isArray(raw.customPresets) ? raw.customPresets : undefined,
    lineCount: Number.isFinite(raw.lineCount) ? raw.lineCount : project.lines.length,
    taggedCount: Number.isFinite(raw.taggedCount) ? raw.taggedCount : taggedCount,
    alertCount: Number.isFinite(raw.alertCount) ? raw.alertCount : project.alerts.length
  }
}

export async function loadArchiveLibrary(): Promise<CallbookArchiveEntry[]> {
  let list: CallbookArchiveEntry[] | null = await idbArchiveGet<CallbookArchiveEntry[]>('library')
  if (!list && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LS_ARCHIVES_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          list = parsed as CallbookArchiveEntry[]
        }
      }
    } catch {
      list = null
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .filter((entry) => entry && typeof entry === 'object' && entry.project)
    .map(normalizeArchiveEntry)
}

export async function saveArchiveLibrary(entries: CallbookArchiveEntry[]): Promise<void> {
  const cloned = entries.map(normalizeArchiveEntry)
  try {
    localStorage.setItem(LS_ARCHIVES_KEY, JSON.stringify(cloned))
  } catch {
    // Ignore localStorage quota errors; IndexedDB holds larger multi-archive sets
  }
  await idbArchivePut('library', cloned)
}

export async function loadArchiveSessionState(): Promise<ArchiveSessionState | null> {
  const idbSession = await idbArchiveGet<ArchiveSessionState>('session')
  let lsSession: ArchiveSessionState | null = null
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LS_ARCHIVE_SESSION_KEY)
      if (raw) {
        lsSession = JSON.parse(raw) as ArchiveSessionState
      }
    } catch {
      lsSession = null
    }
  }
  const idbTs = typeof idbSession?.updatedAt === 'number' ? idbSession.updatedAt : 0
  const lsTs = typeof lsSession?.updatedAt === 'number' ? lsSession.updatedAt : 0
  const session =
    lsSession && (!idbSession || lsTs >= idbTs) ? lsSession : idbSession
  if (!session || typeof session !== 'object') return null
  return {
    activeArchiveId: typeof session.activeArchiveId === 'string' && session.activeArchiveId ? session.activeArchiveId : null,
    hasUnsavedChanges: Boolean(session.hasUnsavedChanges),
    hasFetchedExternalLyrics: Boolean(session.hasFetchedExternalLyrics),
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : undefined
  }
}

export async function saveArchiveSessionState(session: ArchiveSessionState): Promise<void> {
  const payload: ArchiveSessionState = {
    activeArchiveId: session.activeArchiveId,
    hasUnsavedChanges: Boolean(session.hasUnsavedChanges),
    hasFetchedExternalLyrics: Boolean(session.hasFetchedExternalLyrics),
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now()
  }
  try {
    localStorage.setItem(LS_ARCHIVE_SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Ignore localStorage failures
  }
  await idbArchivePut('session', payload)
}
