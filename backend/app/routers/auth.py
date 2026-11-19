import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Employee, RefreshToken, User
from ..schemas import ChangePasswordIn, LoginIn, Me, TokenOut
from ..security import (
    audit, create_access_token, get_current_user, hash_password, hash_token,
    new_refresh_token, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE = "yash_refresh"
_attempts: dict[str, deque] = defaultdict(deque)
MAX_ATTEMPTS, WINDOW_S = 8, 300


def _rate_limit(key: str) -> None:
    now = time.monotonic()
    q = _attempts[key]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again in a few minutes.")
    q.append(now)


def me_of(db: Session, user: User) -> Me:
    emp_id = db.scalar(select(Employee.id).where(Employee.user_id == user.id))
    return Me(id=user.id, email=user.email, full_name=user.full_name,
              role={"id": user.role.id, "name": user.role.name},
              permissions=sorted(user.permission_codes), employee_id=emp_id)


def _issue(db: Session, user: User, response: Response, request: Request, family: str | None = None) -> TokenOut:
    raw, hashed = new_refresh_token()
    rt = RefreshToken(
        user_id=user.id, token_hash=hashed, family=family or str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days),
        user_agent=(request.headers.get("user-agent") or "")[:255],
    )
    db.add(rt)
    db.flush()
    response.set_cookie(
        COOKIE, raw, httponly=True, secure=settings.cookie_secure, samesite="strict",
        max_age=settings.refresh_token_days * 86400, path="/api/auth",
    )
    return rt, TokenOut(access_token=create_access_token(user), user=me_of(db, user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    _rate_limit(f"{ip}:{body.email.lower()}")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        audit(db, user, "login_failed", "auth", summary=f"Failed login for {body.email}", request=request)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    user.last_login_at = datetime.now(timezone.utc)
    _, out = _issue(db, user, response, request)
    audit(db, user, "login", "auth", user.id, request=request)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, db: Session = Depends(get_db),
            token: str | None = Cookie(default=None, alias=COOKIE)):
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No session")
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
    now = datetime.now(timezone.utc)
    if rt is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    benign_race = (rt.revoked_at is not None and rt.replaced_by_id is not None
                   and (now - rt.revoked_at).total_seconds() < 30)
    if rt.revoked_at is not None and not benign_race:
        # Reuse of a rotated token: assume theft, revoke the whole family.
        db.execute(update(RefreshToken).where(RefreshToken.family == rt.family, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=now))
        audit(db, None, "refresh_reuse", "auth", rt.user_id, "Refresh token reuse detected; sessions revoked", request)
        db.commit()
        response.delete_cookie(COOKIE, path="/api/auth")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked")
    if rt.expires_at < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    new_rt, out = _issue(db, user, response, request, family=rt.family)
    if not benign_race:  # (two tabs refreshing at once: keep the original revocation time)
        rt.revoked_at = now
        rt.replaced_by_id = new_rt.id
    db.commit()
    return out


@router.post("/logout", status_code=204)
def logout(response: Response, db: Session = Depends(get_db),
           token: str | None = Cookie(default=None, alias=COOKIE)):
    if token:
        rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(COOKIE, path="/api/auth")


@router.get("/me", response_model=Me)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return me_of(db, user)


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
               .values(revoked_at=datetime.now(timezone.utc)))
    audit(db, user, "change_password", "user", user.id, request=request)
    db.commit()
