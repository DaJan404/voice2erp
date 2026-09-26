import base64
import hashlib
import hmac
import json
import math
import time
from typing import TypedDict, cast


class QuoteConfirmationPayload(TypedDict):
    version: int
    customer_number: str
    item_number: str
    quantity: float
    expires_at: int


class QuoteConfirmationError(ValueError):
    pass


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_confirmation_token(
    *,
    customer_number: str,
    item_number: str,
    quantity: float,
    expires_at: int,
    secret: str,
) -> str:
    if not secret:
        raise QuoteConfirmationError("Missing quote confirmation secret")

    payload: QuoteConfirmationPayload = {
        "version": 1,
        "customer_number": customer_number,
        "item_number": item_number,
        "quantity": quantity,
        "expires_at": expires_at,
    }

    encoded_payload = _encode(
        json.dumps(
            payload,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    signature = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()

    return f"{encoded_payload}.{_encode(signature)}"


def verify_confirmation_token(
    token: str,
    *,
    secret: str,
    now: int | None = None,
) -> QuoteConfirmationPayload:
    if not secret:
        raise QuoteConfirmationError("Missing quote confirmation secret")

    try:
        encoded_payload, encoded_signature = token.split(".", 1)
    except ValueError as exc:
        raise QuoteConfirmationError("Invalid quote confirmation token") from exc

    expected_signature = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()

    try:
        provided_signature = _decode(encoded_signature)
    except Exception as exc:
        raise QuoteConfirmationError("Invalid quote confirmation token") from exc

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise QuoteConfirmationError("Invalid quote confirmation signature")

    try:
        decoded = json.loads(_decode(encoded_payload))
    except Exception as exc:
        raise QuoteConfirmationError("Invalid quote confirmation payload") from exc

    if not isinstance(decoded, dict):
        raise QuoteConfirmationError("Invalid quote confirmation payload")

    version = decoded.get("version")
    customer_number = decoded.get("customer_number")
    item_number = decoded.get("item_number")
    quantity = decoded.get("quantity")
    expires_at = decoded.get("expires_at")

    if (
        version != 1
        or not isinstance(customer_number, str)
        or not customer_number
        or not isinstance(item_number, str)
        or not item_number
        or not isinstance(quantity, int | float)
        or isinstance(quantity, bool)
        or not math.isfinite(float(quantity))
        or float(quantity) <= 0
        or not isinstance(expires_at, int)
    ):
        raise QuoteConfirmationError("Invalid quote confirmation payload")

    current_time = int(time.time()) if now is None else now

    if expires_at < current_time:
        raise QuoteConfirmationError("Quote confirmation expired")

    return cast(
        QuoteConfirmationPayload,
        {
            "version": 1,
            "customer_number": customer_number,
            "item_number": item_number,
            "quantity": float(quantity),
            "expires_at": expires_at,
        },
    )
