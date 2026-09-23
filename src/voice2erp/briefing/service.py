import asyncio
from datetime import UTC, datetime
from typing import Literal, Protocol, TypedDict

from voice2erp.business_central.models import (
    Contact,
    ContactInformation,
    Customer,
    SalesInvoice,
    SalesOrder,
    SalesOrderLine,
    SalesQuote,
)


class BusinessCentralReader(Protocol):
    async def search_customers(
        self,
        query: str,
    ) -> list[Customer]: ...

    async def search_contact_information(
        self,
        query: str,
    ) -> list[ContactInformation]: ...

    async def get_contact(
        self,
        contact_id: str,
    ) -> Contact | None: ...

    async def get_customer_by_id(
        self,
        customer_id: str,
    ) -> Customer | None: ...

    async def get_sales_orders(
        self,
        customer_number: str,
    ) -> list[SalesOrder]: ...

    async def get_sales_quotes(
        self,
        customer_number: str,
    ) -> list[SalesQuote]: ...

    async def get_sales_invoices(
        self,
        customer_number: str,
    ) -> list[SalesInvoice]: ...

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


class BriefingContact(TypedDict):
    name: str
    professional_title: str
    email: str
    phone: str


class BriefingReceivable(TypedDict):
    number: str
    invoice_date: str
    due_date: str
    status: str
    currency: str
    total: float
    remaining_amount: float
    overdue: bool
    dispute_status: str


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


def summarize_contact(
    relation: ContactInformation,
    contact: Contact | None,
) -> BriefingContact:
    return {
        "name": (
            contact.get("displayName", "")
            if contact is not None
            else relation.get("contactName", "")
        ),
        "professional_title": contact.get("jobTitle", "") if contact is not None else "",
        "email": contact.get("email", "") if contact is not None else "",
        "phone": contact.get("phoneNumber", "") if contact is not None else "",
    }


def summarize_receivable(
    invoice: SalesInvoice,
    *,
    today: str,
) -> BriefingReceivable:
    due_date = invoice.get("dueDate", "")
    remaining_amount = float(invoice.get("remainingAmount", 0) or 0)

    return {
        "number": invoice["number"],
        "invoice_date": invoice.get("invoiceDate", ""),
        "due_date": due_date,
        "status": invoice.get("status", ""),
        "currency": invoice.get("currencyCode", ""),
        "total": float(invoice.get("totalAmountIncludingTax", 0) or 0),
        "remaining_amount": remaining_amount,
        "overdue": bool(due_date and due_date < today and remaining_amount > 0),
        "dispute_status": invoice.get("disputeStatus", ""),
    }


class BriefingService:
    def __init__(
        self,
        bc: BusinessCentralReader,
    ) -> None:
        self.bc = bc

    async def _resolve_customer(
        self,
        query: str,
    ) -> tuple[list[Customer], tuple[ContactInformation, Contact | None] | None]:
        customers = await self.bc.search_customers(query)

        if customers:
            return customers, None

        relations = await self.bc.search_contact_information(query)

        if not relations:
            return [], None

        customer_ids = list(
            dict.fromkeys(
                relation["relatedId"]
                for relation in relations
                if relation.get("relatedId")
            )
        )

        resolved = await asyncio.gather(
            *(self.bc.get_customer_by_id(customer_id) for customer_id in customer_ids)
        )
        resolved_customers = [customer for customer in resolved if customer is not None]

        if len(resolved_customers) == 1:
            customer_id = resolved_customers[0]["id"]
            relation = next(
                (
                    candidate
                    for candidate in relations
                    if candidate.get("relatedId") == customer_id
                ),
                relations[0],
            )
            contact = await self.bc.get_contact(relation["contactId"])
            return resolved_customers, (relation, contact)

        return resolved_customers, None

    async def get_customer_briefing(
        self,
        query: str,
    ) -> CustomerBriefingResult:
        matches, resolved_contact = await self._resolve_customer(query)

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

        orders, quotes, invoices = await asyncio.gather(
            self.bc.get_sales_orders(customer_number),
            self.bc.get_sales_quotes(customer_number),
            self.bc.get_sales_invoices(customer_number),
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

        today = datetime.now(UTC).date().isoformat()
        open_invoices = [
            summarize_receivable(invoice, today=today)
            for invoice in invoices
            if float(invoice.get("remainingAmount", 0) or 0) > 0
        ]
        open_invoices.sort(
            key=lambda invoice: (
                not invoice["overdue"],
                invoice["due_date"] or "9999-12-31",
            )
        )

        open_invoice_value = round(
            sum(invoice["remaining_amount"] for invoice in open_invoices),
            2,
        )
        overdue_invoices = [invoice for invoice in open_invoices if invoice["overdue"]]
        overdue_value = round(
            sum(invoice["remaining_amount"] for invoice in overdue_invoices),
            2,
        )
        balance_due = round(float(customer["balanceDue"]), 2)
        balance_difference = round(balance_due - open_invoice_value, 2)

        latest_order = summarize_order(orders_by_date[0]) if orders_by_date else None
        recent_orders = [summarize_order(order) for order in orders_by_date[:3]]

        return {
            "status": "found",
            "briefing": {
                "source": "business_central",
                "resolved_contact": (
                    summarize_contact(*resolved_contact) if resolved_contact is not None else None
                ),
                "customer": {
                    "number": customer["number"],
                    "name": customer["displayName"],
                    "city": customer["city"],
                    "state": customer["state"],
                    "country": customer["country"],
                    "email": customer["email"],
                    "phone": customer.get("phoneNumber", ""),
                    "website": customer.get("website", ""),
                    "balance_due": balance_due,
                    "currency": customer["currencyCode"],
                },
                "accounts_receivable": {
                    "open_invoice_count": len(open_invoices),
                    "open_invoice_value": open_invoice_value,
                    "overdue_invoice_count": len(overdue_invoices),
                    "overdue_value": overdue_value,
                    "balance_vs_open_invoices_difference": balance_difference,
                    "open_invoices_cover_balance": abs(balance_difference) <= 0.01,
                    "open_invoices": open_invoices[:5],
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
