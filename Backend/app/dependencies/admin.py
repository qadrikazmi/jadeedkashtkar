"""
Admin-only dependency for the admin panel routes. Wraps the existing
get_current_user — if the resolved user isn't an admin, the request is
rejected with 403 before the route body ever runs.
"""

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.models.user import User


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
