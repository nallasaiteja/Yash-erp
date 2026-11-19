from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://yash:yash@localhost:5432/yash_erp"
    storage: str = "local"          # local = files on disk; db = bytes in Postgres
    static_dir: str = "/app/static"  # built web app (single-service deploys)

    @field_validator("database_url")
    @classmethod
    def use_psycopg(cls, v: str) -> str:
        # Hosts like Render hand out postgres:// or postgresql:// URLs.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v
    jwt_secret: str = "change-me-in-production-please-use-a-long-random-string"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    cookie_secure: bool = False
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 50
    admin_email: str = "admin@yashpowertech.local"
    admin_password: str = "Admin@12345"


settings = Settings()
