"""Contract error shape shared with module B:
{"error": {"code": "...", "message": "..."}}
"""

STATUS_BY_CODE = {
    "bad_request": 400,
    "not_found": 404,
    "rate_limited": 429,
    "ai_unavailable": 503,
    "internal": 500,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int | None = None):
        if code not in STATUS_BY_CODE and status is None:
            raise ValueError(f"unknown error code: {code}")
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status if status is not None else STATUS_BY_CODE[code]

    def body(self) -> dict:
        return {"error": {"code": self.code, "message": self.message}}
