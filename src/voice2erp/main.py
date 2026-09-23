import json
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
from voice2erp.security import validate_tool_token


class HeadersLike(Protocol):
    def get(self, name: str) -> str | None: ...


class RequestLike(Protocol):
    url: str
    headers: HeadersLike


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
