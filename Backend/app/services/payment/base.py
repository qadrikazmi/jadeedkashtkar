from abc import ABC, abstractmethod

from app.models.order import Order


class PaymentProvider(ABC):
    """Every real provider (Safepay, PayFast, etc.) implements this same
    interface. checkout_service.py never talks to a provider's raw API
    directly — only through these two methods — so swapping providers
    later never touches order creation, the checkout button, or the
    webhook route's plumbing, only which class initiate()/parse_webhook
    forward into."""

    @abstractmethod
    def initiate(self, order: Order) -> str:
        """Start a checkout for this order. Returns the URL the frontend
        should redirect the user to."""
        ...

    @abstractmethod
    def parse_webhook(self, raw_body: bytes, headers: dict) -> dict:
        """Verify the webhook's authenticity (e.g. an HMAC signature
        header, provider-specific) and parse its payload. Raises on a
        failed verification — the caller should treat that as a 400, not
        a trusted event. Returns
        {"order_reference": str, "status": "paid" | "failed"}."""
        ...
