import random
import time
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordWithOtpRequest,
    SignupSendOtpRequest,
    SignupVerifyOtpRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdateRequest,
    VerifyResetOtpRequest,
)
from app.services.auth_service import (
    authenticate_user,
    create_token_for_user,
    get_or_create_guest_user,
    register_user,
    send_reset_otp,
    verify_reset_otp,
    reset_password_with_otp,
)
from app.services.email_service import send_signup_otp_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Temporary in-memory store for signups
SIGNUP_OTP_STORE = {}


@router.post("/signup", response_model=UserResponse, status_code=201)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    user = register_user(db, user_in)
    return user


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, credentials)
    access_token = create_token_for_user(user)
    return Token(access_token=access_token)


@router.post("/guest", response_model=Token)
def guest_login(db: Session = Depends(get_db)):
    user = get_or_create_guest_user(db)
    access_token = create_token_for_user(user)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.hashed_password = hash_password(body.new_password)
    db.add(current_user)
    db.commit()
    return MessageResponse(message="Password updated successfully.")


# ---------- Phone OTP Reset ----------
@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    send_reset_otp(db, body.phone_number)
    return MessageResponse(message="If that number is registered, an OTP has been sent.")


@router.post("/verify-reset-otp", response_model=MessageResponse)
def verify_reset_otp_endpoint(body: VerifyResetOtpRequest, db: Session = Depends(get_db)):
    verify_reset_otp(db, body.phone_number, body.otp)
    return MessageResponse(message="OTP verified successfully.")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password_endpoint(body: ResetPasswordWithOtpRequest, db: Session = Depends(get_db)):
    reset_password_with_otp(db, body.phone_number, body.otp, body.new_password)
    return MessageResponse(message="Password updated — you can now sign in.")


# ---------- Email OTP Signup Flow ----------
@router.post("/send-signup-otp", response_model=MessageResponse)
def send_signup_otp_endpoint(
    body: SignupSendOtpRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    # 1. Check if user already exists
    existing_user = db.query(User).filter(
        (User.email == body.email) | (User.phone_number == body.phone_number)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email or phone number already exists."
        )

    # 2. Generate OTP
    otp = str(random.randint(100000, 999999))

    # 3. Store OTP in memory
    SIGNUP_OTP_STORE[body.email] = {
        "otp": otp,
        "full_name": body.full_name,
        "phone_number": body.phone_number,
        "expires_at": time.time() + (10 * 60)
    }

    # 4. Send Email via BackgroundTasks
    background_tasks.add_task(send_signup_otp_email,
                              body.email, otp, body.full_name)

    return MessageResponse(
        message="OTP sent to email successfully.",
        dev_otp=otp if settings.DEBUG else None
    )


@router.post("/verify-signup-otp", response_model=MessageResponse)
def verify_signup_otp_endpoint(body: SignupVerifyOtpRequest, db: Session = Depends(get_db)):
    # 1. Retrieve the record
    record = SIGNUP_OTP_STORE.get(body.email)

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No OTP requested for this email, or it has expired. Try signing up again."
        )

    # 2. Check expiration
    if time.time() > record["expires_at"]:
        del SIGNUP_OTP_STORE[body.email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new one."
        )

    # 3. Verify OTP
    if record["otp"] != body.otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP."
        )

    record["verified"] = True

    # 4. If password is provided, finalize account creation immediately
    if body.password:
        existing_user = db.query(User).filter(
            (User.email == body.email) | (
                User.phone_number == record["phone_number"])
        ).first()

        if existing_user:
            del SIGNUP_OTP_STORE[body.email]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email or phone number already exists."
            )

        new_user = User(
            email=body.email,
            full_name=record["full_name"],
            phone_number=record["phone_number"],
            hashed_password=hash_password(body.password),
            is_active=True
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # 5. Clean up mapping
        del SIGNUP_OTP_STORE[body.email]

        return MessageResponse(message="Account created successfully!")

    return MessageResponse(message="OTP verified successfully.")
