import asyncio
from typing import Literal, Protocol, TypedDict

from voice2erp.business_central.models import (
    Customer,
    SalesOrder,
    SalesOrderLine,
    SalesQuote,
)


class BusinessCentralReader(Protocol):
    async def search_customers(
        self,
        query: str,
    ) -> list[Customer]: ...

    async def get_sales_orders(
        self,
        customer_number: str,
    ) -> list[SalesOrder]: ...

    async def get_sales_quotes(
        self,
        customer_number: str,
    ) -> list[SalesQuote]: ...

    async def get_sales_order_lines(
        self,
        order_id: str,
    ) -> list[SalesOrderLine]: ...


class BriefingOrderLine(TypedDict):
    item_number: str
    description: str
    quantity: float
    unit_price: float
    total: float
    shipped_quantity: float


class BriefingOrderSummary(TypedDict):
    number: str
    order_date: str
    status: str
    currency: str
    total: float
    fully_shipped: bool


class BriefingOrderDetail(BriefingOrderSummary):
    lines: list[BriefingOrderLine]


class CustomerBriefingFoundResult(TypedDict):
    status: Literal["found"]
    briefing: dict[str, object]


class CustomerBriefingAmbiguousResult(TypedDict):
    status: Literal["ambiguous"]
    query: str
    customers: list[dict[str, str]]


class CustomerBriefingNotFoundResult(TypedDict):
    status: Literal["not_found"]
    query: str


type CustomerBriefingResult = (
    CustomerBriefingFoundResult
    | CustomerBriefingAmbiguousResult
    | CustomerBriefingNotFoundResult
)


def summarize_order(
    order: SalesOrder,
) -> BriefingOrderSummary:
    return {
        "number": order["number"],
        "order_date": order["orderDate"],
        "status": order["status"],
        "currency": order["currencyCode"],
        "total": order["totalAmountIncludingTax"],
        "fully_shipped": order["fullyShipped"],
    }


class BriefingService:
    def __init__(
        self,
        bc: BusinessCentralReader,
    ) -> None:
        self.bc = bc

    async def get_customer_briefing(
        self,
        query: str,
    ) -> CustomerBriefingResult:
        matches = await self.bc.search_customers(query)

        if not matches:
            return {
                "status": "not_found",
                "query": query,
            }

        if len(matches) > 1:
            return {
                "status": "ambiguous",
                "query": query,
                "customers": [
                    {
                        "number": customer["number"],
                        "name": customer["displayName"],
                        "city": customer["city"],
                    }
                    for customer in matches
                ],
            }

        customer = matches[0]
        customer_number = customer["number"]

        orders, quotes = await asyncio.gather(
            self.bc.get_sales_orders(customer_number),
            self.bc.get_sales_quotes(customer_number),
        )

        orders_by_date = sorted(
            orders,
            key=lambda order: order["orderDate"],
            reverse=True,
        )

        largest_order_source = max(
            orders,
            key=lambda order: order["totalAmountIncludingTax"],
            default=None,
        )

        largest_order: BriefingOrderDetail | None = None

        if largest_order_source is not None:
            lines = await self.bc.get_sales_order_lines(largest_order_source["id"])

            largest_order = {
                **summarize_order(largest_order_source),
                "lines": [
                    {
                        "item_number": line["lineObjectNumber"],
                        "description": line["description"],
                        "quantity": line["quantity"],
                        "unit_price": line["unitPrice"],
                        "total": line["amountIncludingTax"],
                        "shipped_quantity": line["shippedQuantity"],
                    }
                    for line in lines
                ],
            }

        open_order_value = sum(order["totalAmountIncludingTax"] for order in orders)

        open_quote_value = sum(quote["totalAmountIncludingTax"] for quote in quotes)

        latest_order = summarize_order(orders_by_date[0]) if orders_by_date else None

        recent_orders = [summarize_order(order) for order in orders_by_date[:3]]

        return {
            "status": "found",
            "briefing": {
                "source": "business_central",
                "customer": {
                    "number": customer["number"],
                    "name": customer["displayName"],
                    "city": customer["city"],
                    "state": customer["state"],
                    "country": customer["country"],
                    "email": customer["email"],
                    "balance_due": customer["balanceDue"],
                    "currency": customer["currencyCode"],
                },
                "sales": {
                    "open_orders": len(orders),
                    "open_order_value": round(
                        open_order_value,
                        2,
                    ),
                    "open_quotes": len(quotes),
                    "open_quote_value": round(
                        open_quote_value,
                        2,
                    ),
                    "latest_order": latest_order,
                    "largest_order": largest_order,
                    "recent_orders": recent_orders,
                },
            },
        }
