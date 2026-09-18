"""
Microsoft Planetary Computer STAC client.
"""

import logging

import planetary_computer
import pystac_client

from app.core.config import settings
from app.exceptions.custom_exceptions import SatelliteDataError

logger = logging.getLogger("app")

_catalog: pystac_client.Client | None = None


def initialize_stac_client() -> None:
    global _catalog
    if _catalog is not None:
        return
    try:
        _catalog = pystac_client.Client.open(
            settings.STAC_API_URL,
            modifier=planetary_computer.sign_inplace,
        )
        logger.info("Planetary Computer STAC client initialized: %s",
                    settings.STAC_API_URL)
    except Exception as e:
        logger.error("Failed to initialize STAC client: %s", e, exc_info=True)
        raise SatelliteDataError(f"STAC initialization failed: {e}")


def ensure_catalog() -> pystac_client.Client:
    if _catalog is None:
        initialize_stac_client()
    return _catalog
