import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL", "sqlite:///./wastechain.db"
    )
    secret_key: str = os.getenv("SECRET_KEY", "wastechain-dev-secret-change-me")
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    discrepancy_threshold_pct: float = 5.0
    osrm_base_url: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")


settings = Settings()
