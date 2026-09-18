# app/services/email_service.py
import os
import smtplib
from email.message import EmailMessage
from app.core.config import settings


def send_email(to_email: str, subject: str, body: str):
    """
    Sends an email using SMTP configuration from settings or environment variables.
    Falls back gracefully between EMAIL_APP_PASSWORD and smtp_password.
    """
    smtp_host = getattr(settings, "smtp_host", "smtp.gmail.com")
    smtp_port = int(getattr(settings, "smtp_port", 587))

    smtp_user = os.getenv("EMAIL_USER") or getattr(settings, "smtp_user", "")
    smtp_password = (
        os.getenv("EMAIL_APP_PASSWORD")
        or os.getenv("smtp_password")
        or getattr(settings, "smtp_password", "")
    )

    email_from = (
        os.getenv("EMAIL_FROM")
        or getattr(settings, "email_from", None)
        or smtp_user
    )

    if not smtp_password:
        raise ValueError(
            "EMAIL_APP_PASSWORD or smtp_password is not set in .env")

    msg = EmailMessage()
    msg.set_content(body)
    msg["Subject"] = subject
    msg["From"] = email_from
    msg["To"] = to_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
    except Exception as e:
        print(f"Failed to send email: {e}")
        raise e


def send_signup_otp_email(to_email: str, otp: str, *args, **kwargs):
    subject = "Your Verification Code - Jadeed Kashtkar"
    body = f"Your 6-digit email verification code is: {otp}\n\nThis code will expire shortly."
    send_email(to_email, subject, body)


def send_reset_otp_email(to_email: str, otp: str, *args, **kwargs):
    subject = "Password Reset Code - Jadeed Kashtkar"
    body = f"Your password reset code is: {otp}\n\nIf you did not request this, please ignore this email."
    send_email(to_email, subject, body)
