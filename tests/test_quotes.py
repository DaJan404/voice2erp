import asyncio

import pytest

from voice2erp.quotes.confirmation import (
    QuoteConfirmationError,
    create_confirmation_token,
    verify_confirmation_token,
)
from voice2erp.quotes.service import QuoteService


class FakeQuoteBusinessCentral:
    def __init__(self) -> None:
        self.created_quotes = 0
        self.created_lines = 0
        self.quote = None
        self.lines = []

    async def search_customers(self, query: str):
        if query.lower() in {"trey research", "20000"}:
            return [self._customer()]
        return []

    async def search_contacts(self, query: str):
        if query.lower() == "helen ray":
            return [
                {
                    "id": "contact-1",
                    "number": "CT000001",
                    "type": "Person",
                    "displayName": "Helen Ray",
                    "jobTitle": "Purchasing Manager",
                    "companyNumber": "CT000010",
                    "companyName": "Trey Research",
                    "phoneNumber": "+1 425-555-0100",
                    "mobilePhoneNumber": "",
                    "email": "helen.ray@contoso.com",
                }
            ]
        return []

    async def get_customer(self, customer_number: str):
        return self._customer() if customer_number == "20000" else None

    async def search_items(self, query: str):
        if query.lower() in {"atlanta whiteboard", "1996-s"}:
            return [self._item()]
        return []

    async def get_item(self, item_number: str):
        return self._item() if item_number == "1996-S" else None

    async def get_sales_quote_by_external_document_number(
        self,
        external_document_number: str,
    ):
        if self.quote and self.quote["externalDocumentNumber"] == external_document_number:
            return self.quote
        return None

    async def get_sales_quote(self, quote_id: str):
        assert self.quote is not None
        assert quote_id == self.quote["id"]
        return self.quote

    async def get_sales_quote_lines(self, quote_id: str):
        assert self.quote is not None
        assert quote_id == self.quote["id"]
        return list(self.lines)

    async def create_sales_quote(
        self,
        *,
        customer_number: str,
        document_date: str,
        external_document_number: str,
    ):
        self.created_quotes += 1
        self.quote = {
            "id": "quote-1",
            "number": "S-QUO1001",
            "customerNumber": customer_number,
            "customerName": "Trey Research",
            "documentDate": document_date,
            "currencyCode": "USD",
            "totalAmountIncludingTax": 2994.6,
            "status": "Draft",
            "externalDocumentNumber": external_document_number,
        }
        return self.quote

    async def create_sales_quote_line(
        self,
        *,
        quote_id: str,
        item_id: str,
        quantity: float,
    ):
        assert self.quote is not None
        assert quote_id == self.quote["id"]
        assert item_id == "item-1"
        self.created_lines += 1
        line = {
            "id": "line-1",
            "documentId": quote_id,
            "sequence": 10000,
            "itemId": item_id,
            "lineType": "Item",
            "lineObjectNumber": "1996-S",
            "description": "ATLANTA Whiteboard, base",
            "unitOfMeasureCode": "PCS",
            "unitPrice": 1397.3,
            "quantity": quantity,
            "amountExcludingTax": 2794.6,
            "totalTaxAmount": 200.0,
            "amountIncludingTax": 2994.6,
        }
        self.lines.append(line)
        return line

    async def delete_sales_quote(self, quote_id: str):
        if self.quote and self.quote["id"] == quote_id:
            self.quote = None
            self.lines = []

    @staticmethod
    def _customer():
        return {
            "id": "customer-1",
            "number": "20000",
            "displayName": "Trey Research",
            "city": "Chicago",
            "state": "IL",
            "country": "US",
            "email": "helen.ray@contoso.com",
            "balanceDue": 3036.6,
            "currencyCode": "USD",
        }

    @staticmethod
    def _item():
        return {
            "id": "item-1",
            "number": "1996-S",
            "displayName": "ATLANTA Whiteboard, base",
            "displayName2": "",
            "type": "Inventory",
            "blocked": False,
            "inventory": 20.0,
            "unitPrice": 1397.3,
            "priceIncludesTax": False,
            "baseUnitOfMeasureCode": "PCS",
        }


def test_confirmation_token_round_trip():
    token = create_confirmation_token(
        customer_number="20000",
        item_number="1996-S",
        quantity=2,
        expires_at=2000,
        secret="test-secret",
    )

    payload = verify_confirmation_token(
        token,
        secret="test-secret",
        now=1000,
    )

    assert payload["customer_number"] == "20000"
    assert payload["item_number"] == "1996-S"
    assert payload["quantity"] == 2
    assert payload["expires_at"] == 2000


def test_confirmation_token_rejects_tampering():
    token = create_confirmation_token(
        customer_number="20000",
        item_number="1996-S",
        quantity=2,
        expires_at=2000,
        secret="test-secret",
    )
    payload, signature = token.split(".", 1)

    with pytest.raises(QuoteConfirmationError):
        verify_confirmation_token(
            payload + "A." + signature,
            secret="test-secret",
            now=1000,
        )


def test_confirmation_token_rejects_expiry():
    token = create_confirmation_token(
        customer_number="20000",
        item_number="1996-S",
        quantity=2,
        expires_at=1000,
        secret="test-secret",
    )

    with pytest.raises(QuoteConfirmationError, match="expired"):
        verify_confirmation_token(
            token,
            secret="test-secret",
            now=1001,
        )


def test_prepare_quote_can_resolve_contact_and_item():
    bc = FakeQuoteBusinessCentral()

    result = asyncio.run(
        QuoteService(bc).prepare_sales_quote(
            customer_query="Helen Ray",
            item_query="ATLANTA Whiteboard",
            quantity=2,
        )
    )

    assert result["status"] == "prepared"
    preview = result["preview"]
    assert preview["customer"]["number"] == "20000"
    assert preview["item"]["number"] == "1996-S"
    assert preview["quantity"] == 2
    assert preview["reference_subtotal"] == 2794.6
    assert preview["requires_confirmation"] is True


def test_execute_quote_creates_and_verifies_then_replays_idempotently():
    bc = FakeQuoteBusinessCentral()
    service = QuoteService(bc)

    first = asyncio.run(
        service.execute_sales_quote(
            customer_number="20000",
            item_number="1996-S",
            quantity=2,
            request_id="98ef3078-41a0-43e2-89f6-a3c67c8f9b70",
        )
    )

    assert first["status"] == "created"
    assert first["quote"]["number"] == "S-QUO1001"
    assert first["quote"]["customer_number"] == "20000"
    assert first["lines"][0]["item_number"] == "1996-S"
    assert bc.created_quotes == 1
    assert bc.created_lines == 1

    second = asyncio.run(
        service.execute_sales_quote(
            customer_number="20000",
            item_number="1996-S",
            quantity=2,
            request_id="98ef3078-41a0-43e2-89f6-a3c67c8f9b70",
        )
    )

    assert second["status"] == "existing"
    assert second["quote"]["number"] == "S-QUO1001"
    assert bc.created_quotes == 1
    assert bc.created_lines == 1
