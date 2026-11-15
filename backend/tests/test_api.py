from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "mock" in data["providers"]


def test_parse_bilingual_lrc_with_ruby():
    lrc = """[00:01.50]夜空を見上げて 響けメロディ
[00:01.50]仰望夜空 让旋律回响吧
[00:04.50]光の中へ 駆け出そうよ
[00:04.50]向着光芒之中 一起奔跑吧"""
    resp = client.post("/api/lyrics/parse", json={"lrc": lrc})
    assert resp.status_code == 200
    data = resp.json()
    assert data["isJapanese"] is True
    assert len(data["lines"]) == 2
    first = data["lines"][0]
    assert first["startTimeMs"] == 1500
    assert first["endTimeMs"] == 4500
    assert "<ruby>" in (first["text"]["ruby"] or "")
    assert "<rt>" in (first["text"]["ruby"] or "")
    assert first["text"]["romaji"]
    assert first["text"]["translation"] == "仰望夜空 让旋律回响吧"


def test_search_mock_fallback():
    resp = client.get("/api/search", params={"q": "Starlight", "source": "mock"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["providerUsed"] == "mock"
    assert len(data["results"]) >= 1
    assert data["results"][0]["id"] == "mock-starlight-175"


def test_get_mock_track_detail():
    resp = client.get("/api/track/mock/mock-starlight-175")
    assert resp.status_code == 200
    data = resp.json()
    assert data["track"]["bpm"] == 175
    assert len(data["lines"]) == 8
    assert data["lines"][0]["text"]["translation"] is not None


def test_site_copy_roundtrip_and_reset(tmp_path, monkeypatch):
    import app.main as main_mod

    backend_copy = tmp_path / "backend_copy.json"
    frontend_dir = tmp_path / "frontend" / "src" / "data"
    frontend_dir.mkdir(parents=True)
    frontend_copy = frontend_dir / "siteCopyOverrides.json"

    monkeypatch.setattr(main_mod.settings, "site_copy_file", str(backend_copy))
    monkeypatch.setattr(main_mod.settings, "frontend_site_copy_file", str(frontend_copy))

    empty_resp = client.get("/api/site-copy")
    assert empty_resp.status_code == 200
    assert empty_resp.json()["entries"] == {}

    payload = {
        "version": 1,
        "entries": {
            "header::h1::abc::0": {
                "key": "header::h1::abc::0",
                "original": "Live Call 控制台",
                "value": "我的 Live 现场控制台",
                "route": "dashboard",
            },
            "noop::span::def::0": {
                "key": "noop::span::def::0",
                "original": "不变文字",
                "value": "不变文字",
                "route": "dashboard",
            },
        },
    }
    put_resp = client.put("/api/site-copy", json=payload)
    assert put_resp.status_code == 200
    put_data = put_resp.json()
    assert put_data["savedCount"] == 1
    assert put_data["projectSynced"] is True
    assert "header::h1::abc::0" in put_data["entries"]
    assert "noop::span::def::0" not in put_data["entries"]
    assert backend_copy.exists()
    assert frontend_copy.exists()

    get_resp = client.get("/api/site-copy")
    assert get_resp.status_code == 200
    assert get_resp.json()["entries"]["header::h1::abc::0"]["value"] == "我的 Live 现场控制台"

    del_resp = client.delete("/api/site-copy")
    assert del_resp.status_code == 200
    assert del_resp.json()["savedCount"] == 0
    assert client.get("/api/site-copy").json()["entries"] == {}


def test_gateway_cookie_normalization_and_configure_roundtrip(tmp_path, monkeypatch):
    import app.main as main_mod
    from app.services.gateway_manager import (
        mask_cookie,
        normalize_netease_cookie,
        update_env_file,
    )

    # 1. Cookie normalizer handles raw tokens, Cookie: prefix, and existing os=pc
    assert normalize_netease_cookie("  ABC1234567890XYZ  ") == "MUSIC_U=ABC1234567890XYZ; os=pc"
    assert (
        normalize_netease_cookie(' "Cookie: NMTID=111; MUSIC_U=TOKEN999" ')
        == "NMTID=111; MUSIC_U=TOKEN999; os=pc"
    )
    assert normalize_netease_cookie("MUSIC_U=TOKEN999; os=pc") == "MUSIC_U=TOKEN999; os=pc"
    assert normalize_netease_cookie("") == ""
    assert "len=16" in mask_cookie("MUSIC_U=0123456789ABCDEF; os=pc")

    # 2. .env updater preserves comments and unrelated vars
    temp_env = tmp_path / ".env"
    temp_env.write_text("# Keep comment\nLRCLIB_BASE_URL=https://custom.lrc\nNETEASE_COOKIE=\n", encoding="utf-8")
    update_env_file(
        temp_env,
        {"MUSIC_API_BASE_URL": "http://127.0.0.1:3000", "NETEASE_COOKIE": "MUSIC_U=XYZ; os=pc"},
    )
    rendered = temp_env.read_text(encoding="utf-8")
    assert "# Keep comment" in rendered
    assert "LRCLIB_BASE_URL=https://custom.lrc" in rendered
    assert "NETEASE_COOKIE=MUSIC_U=XYZ; os=pc" in rendered

    # 3. API configure hot-reloads provider without restarting app
    orig_env = main_mod.env_file_path
    orig_settings = main_mod.settings
    monkeypatch.setattr(main_mod, "env_file_path", temp_env)
    try:
        resp = client.post(
            "/api/gateway/configure",
            json={
                "neteaseCookie": "RAWMUSICUTOKEN123456",
                "gatewayUrl": "http://127.0.0.1:3999",
                "autoStart": False,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gatewayUrl"] == "http://127.0.0.1:3999"
        assert data["cookieConfigured"] is True
        assert data["customProxyEnabled"] is True
        assert "RAWMUS" in data["cookieMasked"]

        # Blank cookie without clearCookie preserves existing cookie
        resp2 = client.post(
            "/api/gateway/configure",
            json={
                "neteaseCookie": "",
                "gatewayUrl": "http://127.0.0.1:3999",
                "autoStart": False,
            },
        )
        assert resp2.status_code == 200
        assert resp2.json()["cookieConfigured"] is True

        # clearCookie wipes it explicitly
        resp3 = client.post(
            "/api/gateway/configure",
            json={
                "neteaseCookie": "",
                "gatewayUrl": "http://127.0.0.1:3999",
                "autoStart": False,
                "clearCookie": True,
            },
        )
        assert resp3.status_code == 200
        assert resp3.json()["cookieConfigured"] is False
    finally:
        main_mod.settings = orig_settings
        main_mod.custom_proxy_provider.update_settings(orig_settings)
        main_mod.env_file_path = orig_env
