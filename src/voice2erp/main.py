import json
from typing import Protocol, TypedDict, cast
from urllib.parse import ParseResult, parse_qs, urlparse

from workers import Response, WorkerEntrypoint

from voice2erp.security import validate_tool_token


class HeadersLike(Protocol):
    def get(self, name: str) -> str | None: ...


class RequestLike(Protocol):
    url: str
    headers: HeadersLike


class LastOrder(TypedDict):
    number: str
    date: str
    amount: float


class Customer(TypedDict):
    number: str
    name: str
    city: str
    open_orders: int
    open_quotes: int
    last_order: LastOrder


CUSTOMERS: list[Customer] = [
    {
        "number": "10000",
        "name": "The Cannon Group",
        "city": "Atlanta",
        "open_orders": 2,
        "open_quotes": 1,
        "last_order": {
            "number": "SO-1042",
            "date": "2026-08-27",
            "amount": 4850.00,
        },
    },
    {
        "number": "20000",
        "name": "Contoso Ltd.",
        "city": "London",
        "open_orders": 1,
        "open_quotes": 0,
        "last_order": {
            "number": "SO-1051",
            "date": "2026-08-30",
            "amount": 2150.00,
        },
    },
]


def json_response(
    payload: object,
    *,
    status: int = 200,
) -> Response:
    return Response(
        json.dumps(payload),
        status=status,
        headers={"content-type": "application/json"},
    )


def search_customers(query: str) -> list[Customer]:
    normalized_query = query.strip().lower()

    return [
        customer
        for customer in CUSTOMERS
        if normalized_query in customer["name"].lower()
        or normalized_query == customer["number"].lower()
    ]


class Default(WorkerEntrypoint):
    async def fetch(self, request: RequestLike) -> Response:
        url: ParseResult = urlparse(request.url)

        if url.path == "/health":
            return json_response({"status": "ok"})

        if url.path == "/api/customers/briefing":
            return await self.get_customer_briefing(request, url)

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

        params: dict[str, list[str]] = parse_qs(url.query)
        query = params.get("query", [""])[0].strip()

        if not query:
            return json_response(
                {"detail": "Missing customer query"},
                status=400,
            )

        matches = search_customers(query)

        if len(matches) == 0:
            return json_response(
                {
                    "status": "not_found",
                    "query": query,
                }
            )

        if len(matches) > 1:
            return json_response(
                {
                    "status": "ambiguous",
                    "query": query,
                    "customers": [
                        {
                            "number": customer["number"],
                            "name": customer["name"],
                            "city": customer["city"],
                        }
                        for customer in matches
                    ],
                }
            )

        customer = matches[0]

        return json_response(
            {
                "status": "found",
                "query": query,
                "customer": {
                    "number": customer["number"],
                    "name": customer["name"],
                    "city": customer["city"],
                },
                "sales": {
                    "open_orders": customer["open_orders"],
                    "open_quotes": customer["open_quotes"],
                    "last_order": customer["last_order"],
                },
            }
        )