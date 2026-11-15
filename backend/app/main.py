from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import DEFAULT_ENV_FILE_PATH, get_settings
from app.models import (
    GatewayConfigureRequest,
    GatewayStatusResponse,
    ParseLyricsRequest,
    ParseLyricsResponse,
    RubyRequest,
    RubyResponse,
    SearchResponse,
    SiteCopyDocumentModel,
    SiteCopySaveResponse,
    TrackDetailResponse,
)
from app.providers.custom_proxy import CustomProxyProvider
from app.providers.lrclib import LrclibProvider
from app.providers.mock import MockProvider
from app.services.gateway_manager import (
    GatewaySupervisor,
    is_loopback_url,
    mask_cookie,
    normalize_gateway_url,
    normalize_netease_cookie,
    update_env_file,
)
from app.services.japanese_ruby import to_ruby_and_romaji
from app.services.lrc_parser import parse_lrc_to_lines
from app.services.site_copy_store import load_site_copy, reset_site_copy, save_site_copy

settings = get_settings()

app = FastAPI(
    title="Live Call Editor API",
    version="1.0.0",
    description="Lightweight lyrics aggregation, LRC parsing, and Japanese ruby furigana service.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lrclib_provider = LrclibProvider(settings)
custom_proxy_provider = CustomProxyProvider(settings)
mock_provider = MockProvider()
gateway_supervisor = GatewaySupervisor()
env_file_path = DEFAULT_ENV_FILE_PATH


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "customProxyEnabled": custom_proxy_provider.enabled,
        "providers": ["lrclib", "mock"]
        + (["custom_proxy"] if custom_proxy_provider.enabled else []),
    }


@app.get("/api/providers")
async def list_providers() -> dict:
    return {
        "providers": [
            {
                "id": "auto",
                "label": "智能聚合 (网关 -> LRCLIB -> Mock)",
                "enabled": True,
            },
            {
                "id": "lrclib",
                "label": "LRCLIB (开放歌词库)",
                "enabled": True,
            },
            {
                "id": "custom_proxy",
                "label": "自建音乐网关 (.env)",
                "enabled": custom_proxy_provider.enabled,
            },
            {
                "id": "mock",
                "label": "内置无版权 Demo (离线兜底)",
                "enabled": True,
            },
        ]
    }


@app.get("/api/search", response_model=SearchResponse)
async def search_tracks(
    q: str = Query(..., min_length=1, description="Song title or artist keyword"),
    source: Literal["auto", "lrclib", "custom_proxy", "mock"] = Query("auto"),
    limit: int = Query(10, ge=1, le=25),
) -> SearchResponse:
    if source == "mock":
        results = await mock_provider.search(q, limit=limit)
        return SearchResponse(
            query=q,
            providerUsed="mock",
            fallbackTriggered=False,
            results=results,
        )

    if source == "custom_proxy":
        if not custom_proxy_provider.enabled:
            results = await mock_provider.search(q, limit=limit)
            return SearchResponse(
                query=q,
                providerUsed="mock",
                fallbackTriggered=True,
                results=results,
            )
        try:
            results = await custom_proxy_provider.search(q, limit=limit)
            return SearchResponse(
                query=q,
                providerUsed="custom_proxy",
                fallbackTriggered=False,
                results=results,
            )
        except httpx.HTTPError:
            results = await mock_provider.search(q, limit=limit)
            return SearchResponse(
                query=q,
                providerUsed="mock",
                fallbackTriggered=True,
                results=results,
            )

    if source == "lrclib":
        try:
            results = await lrclib_provider.search(q, limit=limit)
            if results:
                return SearchResponse(
                    query=q,
                    providerUsed="lrclib",
                    fallbackTriggered=False,
                    results=results,
                )
        except httpx.HTTPError:
            pass
        results = await mock_provider.search(q, limit=limit)
        return SearchResponse(
            query=q,
            providerUsed="mock",
            fallbackTriggered=True,
            results=results,
        )

    # source == "auto": try custom_proxy (if configured) -> lrclib -> mock
    if custom_proxy_provider.enabled:
        try:
            proxy_results = await custom_proxy_provider.search(q, limit=limit)
            if proxy_results:
                return SearchResponse(
                    query=q,
                    providerUsed="custom_proxy",
                    fallbackTriggered=False,
                    results=proxy_results,
                )
        except httpx.HTTPError:
            pass

    try:
        lrclib_results = await lrclib_provider.search(q, limit=limit)
        if lrclib_results:
            return SearchResponse(
                query=q,
                providerUsed="lrclib",
                fallbackTriggered=False,
                results=lrclib_results,
            )
    except httpx.HTTPError:
        pass

    mock_results = await mock_provider.search(q, limit=limit)
    return SearchResponse(
        query=q,
        providerUsed="mock",
        fallbackTriggered=True,
        results=mock_results,
    )


@app.get("/api/track/{provider_name}/{track_id}", response_model=TrackDetailResponse)
async def get_track_detail(
    provider_name: Literal["lrclib", "custom_proxy", "mock"],
    track_id: str,
) -> TrackDetailResponse:
    provider_map = {
        "lrclib": lrclib_provider,
        "custom_proxy": custom_proxy_provider,
        "mock": mock_provider,
    }
    provider = provider_map[provider_name]
    try:
        payload = await provider.get_track_payload(track_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream provider error: {exc}") from exc

    if not payload:
        raise HTTPException(status_code=404, detail="Track not found")

    summary, audio_url, raw_lrc, translated_lrc = payload
    _, lines = parse_lrc_to_lines(raw_lrc, translation_lrc=translated_lrc, enable_ruby=True)
    return TrackDetailResponse(
        track=summary,
        audioUrl=audio_url,
        rawLrc=raw_lrc,
        translatedLrc=translated_lrc,
        lines=lines,
    )


@app.post("/api/lyrics/parse", response_model=ParseLyricsResponse)
async def parse_lyrics(request: ParseLyricsRequest) -> ParseLyricsResponse:
    is_jp, lines = parse_lrc_to_lines(
        lrc=request.lrc,
        translation_lrc=request.translationLrc,
        default_duration_ms=request.defaultDurationMs,
        enable_ruby=request.enableRuby,
        force_japanese_ruby=request.forceJapaneseRuby,
    )
    return ParseLyricsResponse(isJapanese=is_jp, lines=lines)


@app.post("/api/ruby", response_model=RubyResponse)
async def convert_ruby(request: RubyRequest) -> RubyResponse:
    ruby_html, romaji, is_jp = to_ruby_and_romaji(
        request.text, force_japanese=request.forceJapanese
    )
    return RubyResponse(
        original=request.text,
        ruby=ruby_html,
        romaji=romaji,
        isJapanese=is_jp,
    )


def _site_copy_paths() -> tuple[Path, Path]:
    return Path(settings.site_copy_file), Path(settings.frontend_site_copy_file)


@app.get("/api/site-copy", response_model=SiteCopyDocumentModel)
async def get_site_copy() -> SiteCopyDocumentModel:
    primary_path, project_path = _site_copy_paths()
    return load_site_copy(primary_path, fallback_path=project_path)


@app.put("/api/site-copy", response_model=SiteCopySaveResponse)
async def put_site_copy(payload: SiteCopyDocumentModel) -> SiteCopySaveResponse:
    primary_path, project_path = _site_copy_paths()
    saved_doc, project_synced = save_site_copy(
        payload,
        primary_path=primary_path,
        project_path=project_path,
    )
    return SiteCopySaveResponse(
        version=saved_doc.version,
        updatedAt=saved_doc.updatedAt,
        savedCount=len(saved_doc.entries),
        projectSynced=project_synced,
        entries=saved_doc.entries,
    )


@app.delete("/api/site-copy", response_model=SiteCopySaveResponse)
async def delete_site_copy() -> SiteCopySaveResponse:
    primary_path, project_path = _site_copy_paths()
    saved_doc, project_synced = reset_site_copy(
        primary_path=primary_path,
        project_path=project_path,
    )
    return SiteCopySaveResponse(
        version=saved_doc.version,
        updatedAt=saved_doc.updatedAt,
        savedCount=0,
        projectSynced=project_synced,
        entries=saved_doc.entries,
    )


async def _build_gateway_status(message: str = "") -> GatewayStatusResponse:
    effective_url = settings.music_api_base_url.strip() or "http://127.0.0.1:3000"
    norm_cookie = normalize_netease_cookie(settings.netease_cookie)
    online, account = await gateway_supervisor.probe_gateway(
        effective_url, cookie=norm_cookie
    )
    node_bin = gateway_supervisor.find_node_binary()
    ncm_entry = gateway_supervisor.find_ncm_entry()
    can_spawn = is_loopback_url(effective_url) and bool(node_bin) and bool(ncm_entry)
    pid = gateway_supervisor.managed_pid

    if not message:
        if online:
            message = f"网易云网关在线 ({effective_url})"
            if account:
                message = f"{message} · 已登录 {account}"
        else:
            message = "网易云网关未启动"

    return GatewayStatusResponse(
        gatewayUrl=effective_url,
        gatewayOnline=online,
        customProxyEnabled=custom_proxy_provider.enabled,
        cookieConfigured=bool(norm_cookie),
        cookieMasked=mask_cookie(norm_cookie),
        managedByBackend=pid is not None,
        pid=pid,
        canSpawnLocal=can_spawn,
        nodeAvailable=bool(node_bin),
        packageAvailable=bool(ncm_entry),
        neteaseAccount=account,
        message=message,
    )


@app.get("/api/gateway/status", response_model=GatewayStatusResponse)
async def get_gateway_status() -> GatewayStatusResponse:
    return await _build_gateway_status()


@app.post("/api/gateway/configure", response_model=GatewayStatusResponse)
async def configure_gateway(payload: GatewayConfigureRequest) -> GatewayStatusResponse:
    global settings
    gateway_url = normalize_gateway_url(payload.gatewayUrl)

    if payload.clearCookie:
        effective_cookie = ""
    elif payload.neteaseCookie.strip():
        effective_cookie = normalize_netease_cookie(payload.neteaseCookie)
    else:
        effective_cookie = normalize_netease_cookie(settings.netease_cookie)

    search_path = (
        payload.searchPath if payload.searchPath.startswith("/") else f"/{payload.searchPath}"
    )
    lyric_path = (
        payload.lyricPath if payload.lyricPath.startswith("/") else f"/{payload.lyricPath}"
    )
    url_path = payload.urlPath if payload.urlPath.startswith("/") else f"/{payload.urlPath}"

    update_env_file(
        env_file_path,
        {
            "MUSIC_API_BASE_URL": gateway_url,
            "NETEASE_COOKIE": effective_cookie,
            "MUSIC_SEARCH_PATH": search_path,
            "MUSIC_LYRIC_PATH": lyric_path,
            "MUSIC_URL_PATH": url_path,
        },
    )

    get_settings.cache_clear()
    settings = get_settings().model_copy(
        update={
            "music_api_base_url": gateway_url,
            "netease_cookie": effective_cookie,
            "music_search_path": search_path,
            "music_lyric_path": lyric_path,
            "music_url_path": url_path,
        }
    )
    custom_proxy_provider.update_settings(settings)

    status_msg = "已写入 Cookie 与网关配置"
    if payload.autoStart:
        _, start_msg = await gateway_supervisor.start_local_gateway(
            gateway_url, cookie=effective_cookie
        )
        status_msg = start_msg

    return await _build_gateway_status(message=status_msg)


@app.post("/api/gateway/stop", response_model=GatewayStatusResponse)
async def stop_gateway() -> GatewayStatusResponse:
    _, msg = gateway_supervisor.stop_local_gateway()
    return await _build_gateway_status(message=msg)
