import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(
        default=None, min_length=1, max_length=255)
    phone_number: Optional[str] = Field(default=None, pattern=r"^\+92\d{10}$")


class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = Field(default=None, pattern=r"^\+92\d{10}$")
    password: str

    def model_post_init(self, context: Any) -> None:
        if not self.email and not self.phone_number:
            raise ValueError("Either email or phone_number is required")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    is_admin: bool
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(
        default=None, min_length=1, max_length=255)
    phone_number: Optional[str] = Field(default=None, pattern=r"^\+92\d{10}$")


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: int


# ---------- Phone OTP Reset (forgot password) ----------
class ForgotPasswordRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+92\d{10}$")


class VerifyResetOtpRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+92\d{10}$")
    otp: str = Field(..., min_length=6, max_length=6)


class ResetPasswordWithOtpRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\+92\d{10}$")
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)


# ---------- Email OTP Signup Verification ----------
class SignupSendOtpRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone_number: str = Field(..., pattern=r"^\+92\d{10}$")


class SignupVerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
    dev_reset_url: str | None = None
    dev_otp: str | None = None
