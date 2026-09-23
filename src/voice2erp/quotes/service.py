import asyncio
import math
from datetime import UTC, datetime
from typing import Literal, Protocol, TypedDict

from voice2erp.business_central.client import BusinessCentralError
from voice2erp.business_central.models import (
    Contact,
    Customer,
    Item,
    SalesQuote,
    SalesQuoteLine,
)


class QuoteBusinessCentral(Protocol):
    async def search_customers(self, query: str) -> list[Customer]: ...

    async def search_contacts(self, query: str) -> list[Contact]: ...

    async def get_customer(self, customer_number: str) -> Customer | None: ...

    async def search_items(self, query: str) -> list[Item]: ...

    async def get_item(self, item_number: str) -> Item | None: ...

    async def get_sales_quote_by_external_document_number(
        self,
        external_document_number: str,
    ) -> SalesQuote | None: ...

    async def get_sales_quote(self, quote_id: str) -> SalesQuote: ...

    async def get_sales_quote_lines(
        self,
        quote_id: str,
    ) -> list[SalesQuoteLine]: ...

    async def create_sales_quote(
        self,
        *,
        customer_number: str,
        document_date: str,
        external_document_number: str,
    ) -> SalesQuote: ...

    async def create_sales_quote_line(
        self,
        *,
        quote_id: str,
        item_id: str,
        quantity: float,
    ) -> SalesQuoteLine: ...

    async def delete_sales_quote(self, quote_id: str) -> None: ...


class QuoteExecutionError(RuntimeError):
    pass


class QuotePreviewCustomer(TypedDict):
    number: str
    name: str


class QuotePreviewItem(TypedDict):
    number: str
    description: str
    unit_price: float
    unit_of_measure: str
    price_includes_tax: bool


class QuotePreview(TypedDict):
    customer: QuotePreviewCustomer
    item: QuotePreviewItem
    quantity: float
    reference_subtotal: float
    currency: str
    requires_confirmation: bool
    price_note: str


class PreparedQuoteResult(TypedDict):
    status: Literal["prepared"]
    preview: QuotePreview


class QuoteCreatedLine(TypedDict):
    item_number: str
    description: str
    quantity: float
    unit_price: float
    total: float
    unit_of_measure: str


class QuoteCreatedRecord(TypedDict):
    id: str
    number: str
    customer_number: str
    customer_name: str
    document_date: str
    external_document_number: str
    currency: str
    total: float
    status: str


class QuoteExecutionResult(TypedDict):
    status: Literal["created", "existing"]
    quote: QuoteCreatedRecord
    lines: list[QuoteCreatedLine]


def _valid_quantity(quantity: float) -> bool:
    return math.isfinite(quantity) and 0 < quantity <= 10000


class QuoteService:
    def __init__(self, bc: QuoteBusinessCentral) -> None:
        self.bc = bc

    async def _resolve_customer(
        self,
        query: str,
    ) -> list[Customer]:
        customers = await self.bc.search_customers(query)

        if customers:
            return customers

        contacts = await self.bc.search_contacts(query)

        if not contacts:
            return []

        company_names = list(
            dict.fromkeys(
                contact["companyName"].strip()
                for contact in contacts
                if contact.get("companyName", "").strip()
            )
        )
        customer_groups = await asyncio.gather(
            *(self.bc.search_customers(company_name) for company_name in company_names)
        )

        resolved_by_id: dict[str, Customer] = {}

        for group in customer_groups:
            for customer in group:
                resolved_by_id[customer["id"]] = customer

        return list(resolved_by_id.values())

    async def prepare_sales_quote(
        self,
        *,
        customer_query: str,
        item_query: str,
        quantity: float,
    ) -> dict[str, object]:
        if not _valid_quantity(quantity):
            return {
                "status": "invalid_quantity",
                "detail": "Quantity must be greater than zero and no more than 10000.",
            }

        customers = await self._resolve_customer(customer_query)

        if not customers:
            return {
                "status": "customer_not_found",
                "query": customer_query,
            }

        if len(customers) > 1:
            return {
                "status": "customer_ambiguous",
                "query": customer_query,
                "customers": [
                    {
                        "number": customer["number"],
                        "name": customer["displayName"],
                        "city": customer["city"],
                    }
                    for customer in customers
                ],
            }

        items = await self.bc.search_items(item_query)

        if not items:
            return {
                "status": "item_not_found",
                "query": item_query,
            }

        if len(items) > 1:
            return {
                "status": "item_ambiguous",
                "query": item_query,
                "items": [
                    {
                        "number": item["number"],
                        "description": item["displayName"],
                        "unit_price": item["unitPrice"],
                        "unit_of_measure": item["baseUnitOfMeasureCode"],
                    }
                    for item in items
                ],
            }

        customer = customers[0]
        item = items[0]

        if item["blocked"]:
            return {
                "status": "item_blocked",
                "item": {
                    "number": item["number"],
                    "description": item["displayName"],
                },
            }

        preview: QuotePreview = {
            "customer": {
                "number": customer["number"],
                "name": customer["displayName"],
            },
            "item": {
                "number": item["number"],
                "description": item["displayName"],
                "unit_price": float(item["unitPrice"]),
                "unit_of_measure": item["baseUnitOfMeasureCode"],
                "price_includes_tax": bool(item["priceIncludesTax"]),
            },
            "quantity": quantity,
            "reference_subtotal": round(float(item["unitPrice"]) * quantity, 2),
            "currency": customer["currencyCode"],
            "requires_confirmation": True,
            "price_note": (
                "Reference item price only. Business Central calculates the final "
                "customer-specific quote amount when the quote is created."
            ),
        }

        result: PreparedQuoteResult = {
            "status": "prepared",
            "preview": preview,
        }

        return result

    @staticmethod
    def _external_document_number(request_id: str) -> str:
        normalized = "".join(character for character in request_id.upper() if character.isalnum())

        if len(normalized) < 8:
            raise QuoteExecutionError("Invalid quote request id")

        return f"V2ERP-{normalized[:24]}"

    async def _verified_result(
        self,
        *,
        quote_id: str,
        expected_customer_number: str,
        expected_item_number: str,
        expected_quantity: float,
        status: Literal["created", "existing"],
    ) -> QuoteExecutionResult:
        quote, lines = await asyncio.gather(
            self.bc.get_sales_quote(quote_id),
            self.bc.get_sales_quote_lines(quote_id),
        )

        if quote["customerNumber"] != expected_customer_number:
            raise QuoteExecutionError("Created quote customer verification failed")

        matching_lines = [
            line
            for line in lines
            if line.get("lineObjectNumber") == expected_item_number
            and abs(float(line.get("quantity", 0)) - expected_quantity) < 0.000001
        ]

        if not matching_lines:
            raise QuoteExecutionError("Created quote line verification failed")

        return {
            "status": status,
            "quote": {
                "id": quote["id"],
                "number": quote["number"],
                "customer_number": quote["customerNumber"],
                "customer_name": quote["customerName"],
                "document_date": quote["documentDate"],
                "external_document_number": quote.get("externalDocumentNumber", ""),
                "currency": quote["currencyCode"],
                "total": float(quote["totalAmountIncludingTax"]),
                "status": quote["status"],
            },
            "lines": [
                {
                    "item_number": line["lineObjectNumber"],
                    "description": line["description"],
                    "quantity": float(line["quantity"]),
                    "unit_price": float(line["unitPrice"]),
                    "total": float(line["amountIncludingTax"]),
                    "unit_of_measure": line["unitOfMeasureCode"],
                }
                for line in matching_lines
            ],
        }

    async def execute_sales_quote(
        self,
        *,
        customer_number: str,
        item_number: str,
        quantity: float,
        request_id: str,
    ) -> QuoteExecutionResult:
        if not _valid_quantity(quantity):
            raise QuoteExecutionError("Invalid quote quantity")

        customer, item = await asyncio.gather(
            self.bc.get_customer(customer_number),
            self.bc.get_item(item_number),
        )

        if customer is None:
            raise QuoteExecutionError("Confirmed customer no longer exists")

        if item is None:
            raise QuoteExecutionError("Confirmed item no longer exists")

        if item["blocked"]:
            raise QuoteExecutionError("Confirmed item is blocked")

        external_document_number = self._external_document_number(request_id)
        existing_quote = await self.bc.get_sales_quote_by_external_document_number(
            external_document_number
        )

        if existing_quote is not None:
            lines = await self.bc.get_sales_quote_lines(existing_quote["id"])
            matching_line = any(
                line.get("lineObjectNumber") == item_number
                and abs(float(line.get("quantity", 0)) - quantity) < 0.000001
                for line in lines
            )

            if not matching_line:
                if lines:
                    raise QuoteExecutionError(
                        "Existing idempotency record contains different quote lines"
                    )

                await self.bc.create_sales_quote_line(
                    quote_id=existing_quote["id"],
                    item_id=item["id"],
                    quantity=quantity,
                )

            return await self._verified_result(
                quote_id=existing_quote["id"],
                expected_customer_number=customer_number,
                expected_item_number=item_number,
                expected_quantity=quantity,
                status="existing",
            )

        quote = await self.bc.create_sales_quote(
            customer_number=customer_number,
            document_date=datetime.now(UTC).date().isoformat(),
            external_document_number=external_document_number,
        )

        try:
            await self.bc.create_sales_quote_line(
                quote_id=quote["id"],
                item_id=item["id"],
                quantity=quantity,
            )
        except BusinessCentralError:
            try:
                await self.bc.delete_sales_quote(quote["id"])
            except BusinessCentralError:
                pass
            raise

        return await self._verified_result(
            quote_id=quote["id"],
            expected_customer_number=customer_number,
            expected_item_number=item_number,
            expected_quantity=quantity,
            status="created",
        )
