"""
get_current_user — the auth dependency the ported routes import:

    from app.dependencies.auth import get_current_user

Built on top of app/core/security.py's Authorization-header token
decoding (not FastAPI's HTTPBearer, to match your existing style), but
loads and returns the actual User row instead of just an id string, since
every ported service/route expects `current_user.id` / `current_user.email`
on a real object.
"""

import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import _user_id_from_bearer
from app.db.session import get_db
from app.models.user import User


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    user_id_str = _user_id_from_bearer(authorization)
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account deactivated")

    return user


def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Same as get_current_user but returns None instead of raising when no/invalid token."""
    user_id_str = _user_id_from_bearer(authorization)
    if user_id_str is None:
        return None
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        return None
    return db.query(User).filter(User.id == user_uuid, User.is_active.is_(True)).first()
