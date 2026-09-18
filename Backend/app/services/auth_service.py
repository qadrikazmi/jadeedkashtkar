import logging
import random
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from time import time

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.exceptions.custom_exceptions import (
    InvalidCredentialsError,
    InvalidResetTokenError,
    UserAlreadyExistsError,
)
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin

logger = logging.getLogger("app")

GUEST_USER_EMAIL = "guest@jadeedkashtkar.demo"

_otp_attempts = defaultdict(list)
_pending_signups = {}


def get_or_create_guest_user(db: Session) -> User:
    user = db.query(User).filter(User.email == GUEST_USER_EMAIL).first()
    if user is None:
        user = User(
            email=GUEST_USER_EMAIL,
            hashed_password=hash_password(uuid.uuid4().hex),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def register_user(db: Session, user_in: UserCreate) -> User:
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise UserAlreadyExistsError()

    if user_in.phone_number:
        existing_phone = db.query(User).filter(
            User.phone_number == user_in.phone_number
        ).first()
        if existing_phone:
            raise UserAlreadyExistsError(
                "This phone number is already registered.")

    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        phone_number=user_in.phone_number,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, credentials: UserLogin) -> User:
    if credentials.phone_number:
        user = db.query(User).filter(User.phone_number ==
                                     credentials.phone_number).first()
    else:
        user = db.query(User).filter(User.email == credentials.email).first()

    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_active:
        raise InvalidCredentialsError("This account has been deactivated")
    return user


def create_token_for_user(user: User) -> str:
    return create_access_token(subject=str(user.id))


# ---------- Phone OTP Reset (Forgot Password) ----------

def send_reset_otp(db: Session, phone_number: str) -> None:
    user = db.query(User).filter(User.phone_number == phone_number).first()
    if user is None:
        return

    otp = f"{random.randint(100000, 999999)}"
    user.reset_otp = otp
    user.reset_otp_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.add(user)
    db.commit()
    logger.info(f"[stub SMS] OTP for {phone_number}: {otp}")


def verify_reset_otp(db: Session, phone_number: str, otp: str) -> None:
    user = db.query(User).filter(User.phone_number == phone_number).first()
    if (
        user is None
        or not user.reset_otp
        or user.reset_otp != otp
        or user.reset_otp_expires is None
        or user.reset_otp_expires < datetime.now(timezone.utc)
    ):
        raise InvalidResetTokenError("Invalid or expired OTP")


def reset_password_with_otp(
    db: Session, phone_number: str, otp: str, new_password: str
) -> None:
    user = db.query(User).filter(User.phone_number == phone_number).first()
    if (
        user is None
        or not user.reset_otp
        or user.reset_otp != otp
        or user.reset_otp_expires is None
        or user.reset_otp_expires < datetime.now(timezone.utc)
    ):
        raise InvalidResetTokenError("Invalid or expired OTP")

    user.hashed_password = hash_password(new_password)
    user.reset_otp = None
    user.reset_otp_expires = None
    db.add(user)
    db.commit()


def request_password_reset(db: Session, email: str) -> str | None:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return None
    token = create_password_reset_token(str(user.id))
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    logger.info(f"[stub email] password reset for {user.email}: {reset_link}")
    return reset_link if settings.DEBUG else None


def reset_password(db: Session, token: str, new_password: str) -> None:
    user_id = decode_password_reset_token(token)
    if user_id is None:
        raise InvalidResetTokenError()
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise InvalidResetTokenError()
    user.hashed_password = hash_password(new_password)
    db.commit()


# ---------- WhatsApp / Signup Verification Helpers ----------

def _check_rate_limit(phone: str, max_attempts: int = 5, window: int = 3600):
    now = time()
    _otp_attempts[phone] = [
        t for t in _otp_attempts[phone] if now - t < window]
    if len(_otp_attempts[phone]) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
        )
    _otp_attempts[phone].append(now)


def send_whatsapp_otp(
    db: Session,
    phone_number: str,
    email: str,
    full_name: str,
) -> str:
    if db.query(User).filter(User.phone_number == phone_number).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This phone number is already registered.",
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already registered.",
        )

    _check_rate_limit(phone_number)

    otp = f"{random.randint(100000, 999999)}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    _pending_signups[phone_number] = {
        "otp": otp,
        "email": email,
        "full_name": full_name,
        "expires": expires,
    }

    logger.info(f"[WhatsApp OTP] {phone_number} → {otp}")
    return otp


def verify_whatsapp_otp(
    db: Session,
    phone_number: str,
    otp: str,
    last4: str,
) -> dict:
    pending = _pending_signups.get(phone_number)

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending verification found. Please start again.",
        )

    if pending["expires"] < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please start again.",
        )

    if pending["otp"] != otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code.",
        )

    if phone_number[-4:] != last4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last 4 digits do not match.",
        )

    data = pending.copy()
    del _pending_signups[phone_number]

    return {
        "email": data["email"],
        "full_name": data["full_name"],
        "phone_number": phone_number,
    }
