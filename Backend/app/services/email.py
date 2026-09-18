def send_reset_email(to_email: str, token: str):
    reset_link = f"http://localhost:5173/reset-password?token={token}"
    # TODO: swap this for real SMTP/SendGrid once you're ready to deploy
    print(f"\n[DEV] Password reset link for {to_email}:\n{reset_link}\n")
