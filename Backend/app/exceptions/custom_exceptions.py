"""
Shared application exceptions used by services and routes.
"""


class AppException(Exception):
    """Base class for all app-level errors."""

    def __init__(self, message: str = "An error occurred", status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class FieldNotFoundError(AppException):
    def __init__(self, message: str = "Field not found"):
        super().__init__(message, status_code=404)


class JobNotFoundError(AppException):
    def __init__(self, message: str = "Job not found"):
        super().__init__(message, status_code=404)


class AlertNotFoundError(AppException):
    def __init__(self, message: str = "Alert not found"):
        super().__init__(message, status_code=404)


class LedgerEntryNotFoundError(AppException):
    def __init__(self, message: str = "Ledger entry not found"):
        super().__init__(message, status_code=404)


class InvalidGeometryError(AppException):
    def __init__(self, message: str = "Invalid geometry"):
        super().__init__(message, status_code=400)


class InvalidDateRangeError(AppException):
    def __init__(self, message: str = "Invalid date range"):
        super().__init__(message, status_code=400)


class InvalidCredentialsError(AppException):
    def __init__(self, message: str = "Invalid email or password"):
        super().__init__(message, status_code=401)


class UserAlreadyExistsError(AppException):
    def __init__(self, message: str = "User already exists"):
        super().__init__(message, status_code=409)


class InvalidResetTokenError(AppException):
    def __init__(self, message: str = "Invalid or expired reset token"):
        super().__init__(message, status_code=400)


class FutureEntryDateError(AppException):
    def __init__(self, message: str = "Entry date cannot be in the future"):
        super().__init__(message, status_code=400)


class UnsupportedCropError(AppException):
    def __init__(self, message: str = "Unsupported crop"):
        super().__init__(message, status_code=400)


class NoSatelliteImageFoundError(AppException):
    def __init__(self, message: str = "No satellite image found"):
        super().__init__(message, status_code=404)


class SatelliteDataError(AppException):
    def __init__(self, message: str = "Satellite data error"):
        super().__init__(message, status_code=502)


class WeatherServiceError(AppException):
    def __init__(self, message: str = "Weather service error"):
        super().__init__(message, status_code=502)


class InvalidImageError(AppException):
    def __init__(self, message: str = "The uploaded file is not a valid image"):
        super().__init__(message, status_code=422)


class ScanNotFoundError(AppException):
    def __init__(self, message: str = "Scan not found"):
        super().__init__(message, status_code=404)


class BaselineNotFoundError(AppException):
    """
    Raised when no DistrictYieldBaseline row exists for a field's
    district+crop, AND the DEFAULT/DEFAULT fallback baseline is also
    missing (i.e. never seeded in this environment/database).

    422 rather than 404: the *field* was found fine — it's reference/seed
    data that's missing, closer to "can't process this yet" than "not
    found." Previously this path crashed with an unhandled AttributeError
    (calling .baseline_ndvi on None), which produced a bare 500 with no
    CORS headers attached — the browser reported that as a CORS failure
    rather than a server error, which is what actually sent debugging down
    the wrong path originally.
    """

    def __init__(self, message: str = "No yield baseline available for this field's district/crop"):
        super().__init__(message, status_code=422)


def register_exception_handlers(app) -> None:
    """
    Call once from app/main.py:

        from app.exceptions.custom_exceptions import register_exception_handlers
        register_exception_handlers(app)

    Converts every AppException subclass into {"detail": message} with the
    right status code, so routes never need their own try/except blocks.
    """
    from fastapi import Request
    from fastapi.responses import JSONResponse

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})
