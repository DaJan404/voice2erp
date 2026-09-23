import json
import time
from datetime import UTC, datetime
from typing import Protocol, TypedDict, cast
from urllib.parse import ParseResult, parse_qs, urlparse

from workers import Response, WorkerEntrypoint

from voice2erp.briefing.service import BriefingService
from voice2erp.business_central.client import (
    BusinessCentralClient,
    BusinessCentralConfig,
    BusinessCentralError,
)
from voice2erp.quotes.confirmation import (
    QuoteConfirmationError,
    create_confirmation_token,
    verify_confirmation_token,
)
from voice2erp.quotes.service import QuoteExecutionError, QuoteService
from voice2erp.security import validate_tool_token


class HeadersLike(Protocol):
    def get(self, name: str) -> str | None: ...


class RequestLike(Protocol):
    url: str
    method: str
    headers: HeadersLike

    async def json(self) -> object: ...


class VerificationMetadata(TypedDict):
    source: str
    source_name: str
    environment: str
    company_id: str
    retrieved_at: str
    fresh: bool


def json_response(
    payload: object,
    *,
    status: int = 200,
) -> Response:
    return Response(
        json.dumps(payload),
        status=status,
        headers={
            "content-type": "application/json",
            "cache-control": "no-store",
        },
    )


class Default(WorkerEntrypoint):
    async def fetch(self, request: RequestLike) -> Response:
        url: ParseResult = urlparse(request.url)

        if url.path == "/health":
            return json_response({"status": "ok"})

        if url.path == "/api/customers/briefing":
            return await self.get_customer_briefing(request, url)

        if url.path == "/api/verify/customer":
            return await self.verify_customer(request, url)

        if url.path == "/api/quotes/prepare":
            return await self.prepare_sales_quote(request, url)

        if url.path == "/api/quotes/create":
            return await self.create_sales_quote(request)

        if url.path.startswith("/api/debug/bc/customer/"):
            customer_number = url.path.removeprefix("/api/debug/bc/customer/").strip()

            if not customer_number:
                return json_response(
                    {"detail": "Missing customer number"},
                    status=400,
                )

            return await self.get_bc_customer_debug(
                request,
                customer_number,
            )

        return json_response(
            {"detail": "Not Found"},
            status=404,
        )

    async def get_customer_briefing(
        self,
        request: RequestLike,
        url: ParseResult,
    ) -> Response:
        expected_token = cast(
            str | None,
            getattr(self.env, "VOICE2ERP_TOOL_TOKEN", None),
        )

        provided_token = request.headers.get("X-VOICE2ERP-TOKEN")

        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"

            return json_response(
                {"detail": detail},
                status=auth_error,
            )

        query = self._customer_query(url)

        if not query:
            return json_response(
                {"detail": "Missing customer query"},
                status=400,
            )

        try:
            client = self._business_central_client()
            service = BriefingService(client)

            result = await service.get_customer_briefing(query)

        except BusinessCentralError as exc:
            print(f"Business Central error: {exc}")

            return json_response(
                {
                    "status": "error",
                    "detail": "Business Central request failed",
                },
                status=502,
            )

        return json_response(result)

    async def verify_customer(
        self,
        request: RequestLike,
        url: ParseResult,
    ) -> Response:
        expected_token = cast(
            str | None,
            getattr(self.env, "VOICE2ERP_VERIFY_TOKEN", None),
        )

        provided_token = request.headers.get("X-VOICE2ERP-VERIFY-TOKEN")

        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"

            return json_response(
                {"detail": detail},
                status=auth_error,
            )

        query = self._customer_query(url)

        if not query:
            return json_response(
                {"detail": "Missing customer query"},
                status=400,
            )

        try:
            client = self._business_central_client()
            service = BriefingService(client)
            result = await service.get_customer_briefing(query)

        except BusinessCentralError as exc:
            print(f"Business Central verification error: {exc}")

            return json_response(
                {
                    "status": "error",
                    "detail": "Business Central verification failed",
                },
                status=502,
            )

        verification: VerificationMetadata = {
            "source": "business_central",
            "source_name": "Microsoft Dynamics 365 Business Central",
            "environment": self._require_env("BC_ENVIRONMENT"),
            "company_id": self._require_env("BC_COMPANY_ID"),
            "retrieved_at": datetime.now(UTC).isoformat().replace(
                "+00:00",
                "Z",
            ),
            "fresh": True,
        }

        if result["status"] == "found":
            return json_response(
                {
                    "status": "verified",
                    "verification": verification,
                    "briefing": result["briefing"],
                }
            )

        if result["status"] == "ambiguous":
            return json_response(
                {
                    "status": "ambiguous",
                    "verification": verification,
                    "query": query,
                    "customers": result.get("customers", []),
                }
            )

        return json_response(
            {
                "status": "not_found",
                "verification": verification,
                "query": query,
            },
            status=404,
        )

    async def prepare_sales_quote(
        self,
        request: RequestLike,
        url: ParseResult,
    ) -> Response:
        if request.method != "GET":
            return json_response(
                {"detail": "Method Not Allowed"},
                status=405,
            )

        verification_request = request.headers.get("X-VOICE2ERP-VERIFY-TOKEN") is not None

        if verification_request:
            expected_token = cast(
                str | None,
                getattr(self.env, "VOICE2ERP_VERIFY_TOKEN", None),
            )
            provided_token = request.headers.get("X-VOICE2ERP-VERIFY-TOKEN")
        else:
            expected_token = cast(
                str | None,
                getattr(self.env, "VOICE2ERP_TOOL_TOKEN", None),
            )
            provided_token = request.headers.get("X-VOICE2ERP-TOKEN")

        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"
            return json_response(
                {"detail": detail},
                status=auth_error,
            )

        params: dict[str, list[str]] = parse_qs(url.query)
        customer_query = params.get("customer_query", [""])[0].strip()
        item_query = params.get("item_query", [""])[0].strip()
        quantity_value = params.get("quantity", [""])[0].strip()

        if not customer_query or not item_query or not quantity_value:
            return json_response(
                {
                    "detail": (
                        "customer_query, item_query and quantity are required"
                    )
                },
                status=400,
            )

        try:
            quantity = float(quantity_value)
        except ValueError:
            return json_response(
                {"detail": "Quantity must be numeric"},
                status=400,
            )

        try:
            client = self._business_central_client()
            service = QuoteService(client)
            result = await service.prepare_sales_quote(
                customer_query=customer_query,
                item_query=item_query,
                quantity=quantity,
            )
        except BusinessCentralError as exc:
            print(f"Business Central quote preparation error: {exc}")
            return json_response(
                {
                    "status": "error",
                    "detail": "Business Central quote preparation failed",
                },
                status=502,
            )

        if result.get("status") != "prepared" or not verification_request:
            return json_response(result)

        preview = cast(dict[str, object], result["preview"])
        customer = cast(dict[str, object], preview["customer"])
        item = cast(dict[str, object], preview["item"])
        execute_secret = self._require_env("VOICE2ERP_EXECUTE_TOKEN")
        expires_at = int(time.time()) + 600

        confirmation_token = create_confirmation_token(
            customer_number=cast(str, customer["number"]),
            item_number=cast(str, item["number"]),
            quantity=float(cast(float, preview["quantity"])),
            expires_at=expires_at,
            secret=execute_secret,
        )

        return json_response(
            {
                **result,
                "confirmation_token": confirmation_token,
                "confirmation_expires_at": expires_at,
            }
        )

    async def create_sales_quote(
        self,
        request: RequestLike,
    ) -> Response:
        if request.method != "POST":
            return json_response(
                {"detail": "Method Not Allowed"},
                status=405,
            )

        expected_token = cast(
            str | None,
            getattr(self.env, "VOICE2ERP_EXECUTE_TOKEN", None),
        )
        provided_token = request.headers.get("X-VOICE2ERP-EXECUTE-TOKEN")

        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"
            return json_response(
                {"detail": detail},
                status=auth_error,
            )

        try:
            body = await request.json()
        except Exception:
            return json_response(
                {"detail": "Invalid JSON body"},
                status=400,
            )

        if not isinstance(body, dict):
            return json_response(
                {"detail": "Invalid JSON body"},
                status=400,
            )

        confirmation_token = body.get("confirmation_token")
        request_id = body.get("request_id")

        if not isinstance(confirmation_token, str) or not confirmation_token:
            return json_response(
                {"detail": "Missing confirmation token"},
                status=400,
            )

        if not isinstance(request_id, str) or not request_id:
            return json_response(
                {"detail": "Missing request id"},
                status=400,
            )

        try:
            confirmed = verify_confirmation_token(
                confirmation_token,
                secret=cast(str, expected_token),
            )
            client = self._business_central_client()
            service = QuoteService(client)
            result = await service.execute_sales_quote(
                customer_number=confirmed["customer_number"],
                item_number=confirmed["item_number"],
                quantity=confirmed["quantity"],
                request_id=request_id,
            )
        except QuoteConfirmationError as exc:
            return json_response(
                {
                    "status": "confirmation_invalid",
                    "detail": str(exc),
                },
                status=400,
            )
        except QuoteExecutionError as exc:
            return json_response(
                {
                    "status": "conflict",
                    "detail": str(exc),
                },
                status=409,
            )
        except BusinessCentralError as exc:
            print(f"Business Central quote execution error: {exc}")
            return json_response(
                {
                    "status": "error",
                    "detail": "Business Central quote creation failed",
                },
                status=502,
            )

        verification: VerificationMetadata = {
            "source": "business_central",
            "source_name": "Microsoft Dynamics 365 Business Central",
            "environment": self._require_env("BC_ENVIRONMENT"),
            "company_id": self._require_env("BC_COMPANY_ID"),
            "retrieved_at": datetime.now(UTC).isoformat().replace(
                "+00:00",
                "Z",
            ),
            "fresh": True,
        }

        return json_response(
            {
                **result,
                "verification": verification,
            },
            status=201 if result["status"] == "created" else 200,
        )

    async def get_bc_customer_debug(
        self,
        request: RequestLike,
        customer_number: str,
    ) -> Response:
        expected_token = cast(
            str | None,
            getattr(self.env, "VOICE2ERP_TOOL_TOKEN", None),
        )

        provided_token = request.headers.get("X-VOICE2ERP-TOKEN")

        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"

            return json_response(
                {"detail": detail},
                status=auth_error,
            )

        try:
            client = self._business_central_client()
            customer = await client.get_customer(customer_number)

        except BusinessCentralError as exc:
            print(f"Business Central error: {exc}")

            return json_response(
                {
                    "status": "error",
                    "detail": "Business Central request failed",
                },
                status=502,
            )

        if customer is None:
            return json_response(
                {
                    "status": "not_found",
                    "customer_number": customer_number,
                },
                status=404,
            )

        return json_response(
            {
                "status": "found",
                "source": "business_central",
                "customer": customer,
            }
        )

    @staticmethod
    def _customer_query(url: ParseResult) -> str:
        params: dict[str, list[str]] = parse_qs(url.query)
        return params.get("query", [""])[0].strip()

    def _require_env(self, name: str) -> str:
        value = cast(
            str | None,
            getattr(self.env, name, None),
        )

        if not isinstance(value, str) or not value.strip():
            raise BusinessCentralError(f"Missing Business Central configuration: {name}")

        return value

    def _business_central_client(
        self,
    ) -> BusinessCentralClient:
        return BusinessCentralClient(
            BusinessCentralConfig(
                tenant_id=self._require_env("BC_TENANT_ID"),
                client_id=self._require_env("BC_CLIENT_ID"),
                client_secret=self._require_env("BC_CLIENT_SECRET"),
                environment=self._require_env("BC_ENVIRONMENT"),
                company_id=self._require_env("BC_COMPANY_ID"),
            )
        )
