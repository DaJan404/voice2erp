import asyncio

from voice2erp.briefing.service import BriefingService


class FakeBusinessCentral:
    async def search_customers(self, query: str):
        if query.lower() == "trey research":
            return [self._customer()]
        return []

    async def search_contact_information(self, query: str):
        if query.lower() == "helen ray":
            return [
                {
                    "contactId": "contact-1",
                    "contactNumber": "CT000001",
                    "contactName": "Helen Ray",
                    "contactType": "Person",
                    "relatedId": "customer-1",
                    "relatedType": "Customer",
                }
            ]
        return []

    async def get_contact(self, contact_id: str):
        if contact_id != "contact-1":
            return None

        return {
            "id": "contact-1",
            "number": "CT000001",
            "type": "Person",
            "displayName": "Helen Ray",
            "jobTitle": "Purchasing Manager",
            "companyNumber": "20000",
            "companyName": "Trey Research",
            "phoneNumber": "+1 425-555-0100",
            "mobilePhoneNumber": "",
            "email": "helen.ray@contoso.com",
        }

    async def get_customer_by_id(self, customer_id: str):
        return self._customer() if customer_id == "customer-1" else None

    async def get_sales_orders(self, customer_number: str):
        return [
            {
                "id": "order-1",
                "number": "S-ORD1",
                "customerNumber": customer_number,
                "customerName": "Trey Research",
                "orderDate": "2026-04-18",
                "currencyCode": "USD",
                "totalAmountIncludingTax": 1200.0,
                "fullyShipped": False,
                "status": "Draft",
            }
        ]

    async def get_sales_quotes(self, customer_number: str):
        return []

    async def get_sales_invoices(self, customer_number: str):
        return [
            {
                "id": "invoice-1",
                "number": "S-INV1",
                "invoiceDate": "2026-01-01",
                "postingDate": "2026-01-01",
                "dueDate": "2026-02-01",
                "customerNumber": customer_number,
                "customerName": "Trey Research",
                "currencyCode": "USD",
                "remainingAmount": 750.0,
                "totalAmountIncludingTax": 750.0,
                "status": "Open",
                "disputeStatus": "",
            }
        ]

    async def get_sales_order_lines(self, order_id: str):
        return []

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
            "balanceDue": 750.0,
            "currencyCode": "USD",
            "phoneNumber": "+1 425-555-0100",
            "website": "",
        }


def test_contact_name_resolves_linked_customer():
    result = asyncio.run(
        BriefingService(FakeBusinessCentral()).get_customer_briefing("Helen Ray")
    )

    assert result["status"] == "found"
    briefing = result["briefing"]
    assert briefing["customer"]["number"] == "20000"
    assert briefing["resolved_contact"]["name"] == "Helen Ray"
    assert briefing["resolved_contact"]["professional_title"] == "Purchasing Manager"


def test_receivables_explain_balance_without_speculation():
    result = asyncio.run(
        BriefingService(FakeBusinessCentral()).get_customer_briefing("Trey Research")
    )

    assert result["status"] == "found"
    receivables = result["briefing"]["accounts_receivable"]
    assert receivables["open_invoice_count"] == 1
    assert receivables["open_invoice_value"] == 750.0
    assert receivables["open_invoices_cover_balance"] is True
    assert receivables["balance_vs_open_invoices_difference"] == 0.0


def test_unknown_contact_remains_not_found():
    result = asyncio.run(
        BriefingService(FakeBusinessCentral()).get_customer_briefing("Unknown Person")
    )

    assert result == {
        "status": "not_found",
        "query": "Unknown Person",
    }
