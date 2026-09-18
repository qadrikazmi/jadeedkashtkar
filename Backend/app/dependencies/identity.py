"""
Resolves the caller's identity for endpoints that work for logged-in users.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import _user_id_from_bearer
from app.db.session import get_db
from app.models.user import User


@dataclass
class CallerIdentity:
    user: User

    @property
    def is_authenticated(self) -> bool:
        return self.user is not None


def get_caller_identity(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> CallerIdentity:
    user_id_str = _user_id_from_bearer(authorization)

    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    return CallerIdentity(user=user)
