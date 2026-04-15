import os
from insights.config import Settings

def test_defaults(monkeypatch):
    monkeypatch.delenv("INSIGHTS_DATABASE_URL", raising=False)
    monkeypatch.setenv("INSIGHTS_DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    s = Settings()
    assert s.port == 8000
    assert s.relay_url == "http://localhost:3100"
    assert s.cors_origins == ["http://localhost:3200"]
    assert s.events_retention_days == 30

def test_cors_csv(monkeypatch):
    monkeypatch.setenv("INSIGHTS_DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("INSIGHTS_CORS_ORIGINS", "http://a,http://b")
    s = Settings()
    assert s.cors_origins == ["http://a", "http://b"]
