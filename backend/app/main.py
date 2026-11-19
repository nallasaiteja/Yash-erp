import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .routers import admin, auth, hr, work

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("yash")

app = FastAPI(
    title="Yash Power Tech ERP API",
    version="0.1.0 (Phase 1 — Core ERP)",
    description="Authentication, roles & permissions, employees & HR, attendance, leave, tasks, documents, audit.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

for r in (auth.router, admin.router, hr.router, work.router):
    app.include_router(r)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- Serve the statically exported web app (single-service deploys, e.g. Render) ----
STATIC = Path(settings.static_dir).resolve()
if STATIC.is_dir():
    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        clean = path.strip("/")
        for candidate in ([clean] if clean else []) + [f"{clean}.html" if clean else "index.html", f"{clean}/index.html"]:
            f = (STATIC / candidate).resolve()
            if f.is_file() and STATIC in f.parents:
                cache = "public, max-age=31536000, immutable" if clean.startswith("_next/static/") else "no-cache"
                return FileResponse(f, headers={"Cache-Control": cache})
        nf = STATIC / "404.html"
        return FileResponse(nf, status_code=404) if nf.is_file() else JSONResponse({"detail": "Not Found"}, 404)
