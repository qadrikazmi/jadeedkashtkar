from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # Truncate password to 72 bytes to prevent bcrypt ValueError crashes
    if isinstance(password, str):
        password = password.encode(
            "utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    data: dict = None,
    expires_minutes: int = None,
    *,
    subject: str = None,
):
    """
    Supports both styles:
      create_access_token(data={"sub": "1"})
      create_access_token(subject="1")   # used by auth_service
    """
    if data is None and subject is not None:
        to_encode = {"sub": str(subject)}
    elif data is not None:
        to_encode = data.copy()
    else:
        raise ValueError("Provide data= or subject=")

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_password_reset_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=getattr(settings, "RESET_TOKEN_EXPIRE_MINUTES", 60)
    )
    payload = {"sub": str(subject), "exp": expire, "type": "reset"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_password_reset_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        if payload.get("type") != "reset":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def _user_id_from_bearer(authorization: Optional[str]) -> Optional[str]:
    """
    Returns the raw string subject (a UUID string, since every model's PK
    is UUID(as_uuid=True) — NOT an int) or None. Previously this cast to
    int(sub), which raised on a UUID string and was silently swallowed —
    meaning every request looked unauthenticated. Callers that need a real
    uuid.UUID object should use get_current_user in app/dependencies/auth.py,
    which builds on this and also loads the actual User row.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        return str(sub)
    except JWTError:
        return None


def get_optional_user_id(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Returns the user id (UUID string) if a valid JWT is present, else None. Never raises."""
    return _user_id_from_bearer(authorization)


def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Required auth — raises 401 if missing/invalid token. Returns UUID string."""
    user_id = _user_id_from_bearer(authorization)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id
