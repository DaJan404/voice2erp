from typing import TypedDict, cast
from urllib.parse import parse_qs, urlparse

from workers import Response, WorkerEntrypoint

from voice2erp.security import validate_tool_token


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


def search_customers(query: str) -> list[Customer]:
    query = query.strip().lower()

    return [
        customer
        for customer in CUSTOMERS
        if query in customer["name"].lower() or query == customer["number"].lower()
    ]


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlparse(request.url)

        if url.path == "/health":
            return Response.json({"status": "ok"})

        if url.path == "/api/customers/briefing":
            return await self.get_customer_briefing(request, url)

        return Response.json(
            {"detail": "Not Found"},
            status=404,
        )

    async def get_customer_briefing(self, request, url):
        expected_token = cast(
            str | None,
            getattr(self.env, "VOICE2ERP_TOOL_TOKEN", None),
        )
        provided_token = cast(
            str | None,
            request.headers.get("X-VOICE2ERP-TOKEN"),
        )
        auth_error = validate_tool_token(
            expected_token,
            provided_token,
        )

        if auth_error is not None:
            detail = "Service unavailable" if auth_error == 503 else "Unauthorized"

            return Response.json(
                {"detail": detail},
                status=auth_error,
            )

        params = parse_qs(url.query)
        query = params.get("query", [""])[0].strip()

        if not query:
            return Response.json(
                {"detail": "Missing customer query"},
                status=400,
            )

        matches = search_customers(query)

        if len(matches) == 0:
            return Response.json(
                {
                    "status": "not_found",
                    "query": query,
                }
            )

        if len(matches) > 1:
            return Response.json(
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

        return Response.json(
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
