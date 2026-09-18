from app.core.config import settings
from app.models.order import Order
from app.services.payment.base import PaymentProvider


class StubProvider(PaymentProvider):
    """No real payment account needed. Sends the user to a mock
    confirmation page on our own frontend instead of a real provider's
    checkout page — clicking "Confirm" there hits our own
    /api/payments/mock/confirm endpoint, which marks the order paid the
    same way a real webhook would. Lets the entire checkout → plan
    upgrade flow be built and tested with zero provider account.

    parse_webhook is intentionally unimplemented — the stub flow never
    receives a real webhook (mock/confirm and mock/fail call
    checkout_service directly instead), so there's nothing for it to
    parse. It only exists to satisfy the PaymentProvider interface.
    """

    def initiate(self, order: Order) -> str:
        frontend_base = settings.FRONTEND_URL
        return f"{frontend_base}/payment/mock?order_id={order.id}"

    def parse_webhook(self, raw_body: bytes, headers: dict) -> dict:
        raise NotImplementedError(
            "StubProvider has no real webhook — use /payments/mock/confirm "
            "and /payments/mock/fail instead while testing without a provider."
        )
