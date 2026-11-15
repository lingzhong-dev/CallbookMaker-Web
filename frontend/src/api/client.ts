import type { LyricLine, SearchResponse, TrackDetailResponse } from '../types/callbook'

export interface ProviderOption {
  id: 'auto' | 'lrclib' | 'custom_proxy' | 'mock'
  label: string
  enabled: boolean
}

export async function checkBackendHealth(): Promise<{
  ok: boolean
  customProxyEnabled: boolean
}> {
  try {
    const resp = await fetch('/health')
    if (!resp.ok) return { ok: false, customProxyEnabled: false }
    const data = await resp.json()
    return {
      ok: data?.status === 'ok',
      customProxyEnabled: Boolean(data?.customProxyEnabled)
    }
  } catch {
    return { ok: false, customProxyEnabled: false }
  }
}

export async function fetchProviders(): Promise<ProviderOption[]> {
  try {
    const resp = await fetch('/api/providers')
    if (!resp.ok) throw new Error('Failed to load providers')
    const data = await resp.json()
    return data.providers || []
  } catch {
    return [
      { id: 'auto', label: '智能聚合 (网关 -> LRCLIB -> Mock)', enabled: true },
      { id: 'lrclib', label: 'LRCLIB (开放歌词库)', enabled: true },
      { id: 'custom_proxy', label: '自建音乐网关 (.env)', enabled: false },
      { id: 'mock', label: '内置无版权 Demo (离线兜底)', enabled: true }
    ]
  }
}

export async function searchTracksApi(
  query: string,
  source: ProviderOption['id'] = 'auto'
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, source, limit: '12' })
  const resp = await fetch(`/api/search?${params.toString()}`)
  if (!resp.ok) {
    throw new Error(`搜索请求失败 (${resp.status})`)
  }
  return resp.json()
}

export async function fetchTrackDetailApi(
  provider: string,
  trackId: string
): Promise<TrackDetailResponse> {
  const safeProvider = encodeURIComponent(provider)
  const safeId = encodeURIComponent(trackId)
  const resp = await fetch(`/api/track/${safeProvider}/${safeId}`)
  if (!resp.ok) {
    throw new Error(`获取曲目详情失败 (${resp.status})`)
  }
  return resp.json()
}

export async function parseLyricsApi(
  lrc: string,
  translationLrc = '',
  forceJapaneseRuby = false
): Promise<{ isJapanese: boolean; lines: LyricLine[] }> {
  const resp = await fetch('/api/lyrics/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lrc,
      translationLrc,
      enableRuby: true,
      forceJapaneseRuby
    })
  })
  if (!resp.ok) {
    throw new Error(`歌词解析失败 (${resp.status})`)
  }
  return resp.json()
}

export async function convertRubyApi(
  text: string,
  forceJapanese = true
): Promise<{ original: string; ruby: string; romaji: string; isJapanese: boolean }> {
  const resp = await fetch('/api/ruby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, forceJapanese })
  })
  if (!resp.ok) {
    throw new Error(`注音转换失败 (${resp.status})`)
  }
  return resp.json()
}

export interface SiteCopyEntryPayload {
  key: string
  original: string
  value: string
  route: string
  updatedAt: string
}

export interface SiteCopyDocumentPayload {
  version: number
  updatedAt: string
  entries: Record<string, SiteCopyEntryPayload>
}

export interface SiteCopySavePayload extends SiteCopyDocumentPayload {
  savedCount: number
  projectSynced: boolean
}

export async function fetchSiteCopyApi(): Promise<SiteCopyDocumentPayload> {
  const resp = await fetch('/api/site-copy')
  if (!resp.ok) {
    throw new Error(`加载全站文案配置失败 (${resp.status})`)
  }
  return resp.json()
}

export async function saveSiteCopyApi(
  entries: Record<string, SiteCopyEntryPayload>
): Promise<SiteCopySavePayload> {
  const resp = await fetch('/api/site-copy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      entries
    })
  })
  if (!resp.ok) {
    throw new Error(`保存全站文案配置失败 (${resp.status})`)
  }
  return resp.json()
}

export async function resetSiteCopyApi(): Promise<SiteCopySavePayload> {
  const resp = await fetch('/api/site-copy', {
    method: 'DELETE'
  })
  if (!resp.ok) {
    throw new Error(`重置全站文案配置失败 (${resp.status})`)
  }
  return resp.json()
}
