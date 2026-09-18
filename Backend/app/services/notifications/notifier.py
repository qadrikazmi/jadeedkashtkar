"""
Notifier interface — see GAPS.md Gap 6.

SMS is out of scope until a provider is chosen (no user input needed yet
per the ground rules; it's a deferred decision, not a blocker). Alert
delivery is built against this interface so swapping in a real SMS
provider later is a new class, not a refactor of the alert engine.
"""

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.user import User

logger = logging.getLogger("app")


class Notifier(ABC):
    @abstractmethod
    def notify(self, user: "User", alert: "Alert") -> None: ...


class InAppNotifier(Notifier):
    """
    No-op beyond the Alert row itself: persisting it in the alerts table
    *is* the in-app delivery channel (GET /alerts, bell dropdown, dashboard
    banner all just read that table).
    """

    def notify(self, user: "User", alert: "Alert") -> None:
        pass


class EmailNotifier(Notifier):
    """Stub — logs instead of sending until an email provider is wired up."""

    def notify(self, user: "User", alert: "Alert") -> None:
        logger.info(
            f"[stub email notifier] would email {user.email}: {alert.title}")
