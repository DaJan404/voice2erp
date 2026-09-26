import json
import time
from dataclasses import dataclass
from http import HTTPMethod
from typing import Protocol, TypedDict, cast
from urllib.parse import urlencode

from workers import fetch

from voice2erp.business_central.errors import BusinessCentralError
from voice2erp.business_central.models import (
    Contact,
    Customer,
    Item,
    SalesInvoice,
    SalesOrder,
    SalesOrderLine,
    SalesQuote,
    SalesQuoteLine,
)


class FetchResponseLike(Protocol):
    ok: bool
    status: int

    async def text(self) -> str: ...


class ItemSearchCandidate(TypedDict):
    number: str
    description: str
    description2: str
    unitPrice: float
    uom: str
    blocked: bool


class ItemSearchResult(TypedDict):
    status: str
    query: str
    matchedQuery: str
    count: int
    items: list[ItemSearchCandidate]


@dataclass(frozen=True, slots=True)
class BusinessCentralConfig:
    tenant_id: str
    client_id: str
    client_secret: str
    environment: str
    company_id: str


class BusinessCentralClient:
    def __init__(self, config: BusinessCentralConfig) -> None:
        self.config = config
        self._access_token: str | None = None
        self._token_expires_at = 0.0

    @property
    def base_url(self) -> str:
        return (
            "https://api.businesscentral.dynamics.com/v2.0/"
            f"{self.config.tenant_id}/"
            f"{self.config.environment}/"
            "api/v2.0/"
            f"companies({self.config.company_id})"
        )

    @property
    def odata_base_url(self) -> str:
        return (
            "https://api.businesscentral.dynamics.com/v2.0/"
            f"{self.config.tenant_id}/"
            f"{self.config.environment}/"
            "ODataV4"
        )

    async def _get_access_token(self) -> str:
        if self._access_token is not None and time.time() < self._token_expires_at:
            return self._access_token

        token_url = f"https://login.microsoftonline.com/{self.config.tenant_id}/oauth2/v2.0/token"

        body = urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "scope": "https://api.businesscentral.dynamics.com/.default",
            }
        )

        response = cast(
            FetchResponseLike,
            await fetch(
                token_url,
                method=HTTPMethod.POST,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body=body,
            ),
        )

        response_text = await response.text()

        if not response.ok:
            raise BusinessCentralError(
                f"Microsoft Entra authentication failed "
                f"with HTTP {response.status}: {response_text}"
            )

        payload = json.loads(response_text)

        access_token = payload.get("access_token")
        expires_in = payload.get("expires_in", 3600)

        if not isinstance(access_token, str):
            raise BusinessCentralError("Authentication response did not contain an access token")

        if not isinstance(expires_in, int):
            expires_in = 3600

        self._access_token = access_token

        # Refresh at least 60 seconds before actual expiration.
        self._token_expires_at = time.time() + max(expires_in - 60, 0)

        return access_token

    async def _get(
        self,
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, object]:
        token = await self._get_access_token()

        url = f"{self.base_url}/{path}"

        if params:
            url = f"{url}?{urlencode(params)}"

        response = cast(
            FetchResponseLike,
            await fetch(
                url,
                method=HTTPMethod.GET,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            ),
        )

        response_text = await response.text()

        if not response.ok:
            raise BusinessCentralError(
                f"Business Central returned HTTP {response.status}: {response_text}"
            )

        payload = json.loads(response_text)

        if not isinstance(payload, dict):
            raise BusinessCentralError("Business Central returned an unexpected response")

        return cast(dict[str, object], payload)

    async def _post(
        self,
        path: str,
        body: dict[str, object],
    ) -> dict[str, object]:
        token = await self._get_access_token()

        response = cast(
            FetchResponseLike,
            await fetch(
                f"{self.base_url}/{path}",
                method=HTTPMethod.POST,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body=json.dumps(body),
            ),
        )

        response_text = await response.text()

        if not response.ok:
            raise BusinessCentralError(
                f"Business Central returned HTTP {response.status}: {response_text}"
            )

        payload = json.loads(response_text)

        if not isinstance(payload, dict):
            raise BusinessCentralError("Business Central returned an unexpected response")

        return cast(dict[str, object], payload)

    async def _post_odata_action(
        self,
        action: str,
        body: dict[str, object],
    ) -> dict[str, object]:
        token = await self._get_access_token()

        query_string = urlencode(
            {
                "company": self.config.company_id,
            }
        )

        url = f"{self.odata_base_url}/{action}?{query_string}"

        response = cast(
            FetchResponseLike,
            await fetch(
                url,
                method=HTTPMethod.POST,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                body=json.dumps(body),
            ),
        )

        response_text = await response.text()

        if not response.ok:
            raise BusinessCentralError(
                f"Business Central OData action returned HTTP {response.status}: {response_text}"
            )

        payload = json.loads(response_text)

        if not isinstance(payload, dict):
            raise BusinessCentralError(
                "Business Central returned an unexpected OData action response"
            )

        return cast(dict[str, object], payload)

    async def _delete(
        self,
        path: str,
    ) -> None:
        token = await self._get_access_token()

        response = cast(
            FetchResponseLike,
            await fetch(
                f"{self.base_url}/{path}",
                method=HTTPMethod.DELETE,
                headers={
                    "Authorization": f"Bearer {token}",
                    "If-Match": "*",
                },
            ),
        )

        if response.ok:
            return

        response_text = await response.text()

        raise BusinessCentralError(
            f"Business Central returned HTTP {response.status}: {response_text}"
        )

    @staticmethod
    def _odata_string(value: str) -> str:
        return value.replace("'", "''")

    async def get_customer(
        self,
        customer_number: str,
    ) -> Customer | None:
        safe_number = self._odata_string(customer_number)

        payload = await self._get(
            "customers",
            {
                "$filter": f"number eq '{safe_number}'",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list) or not values:
            return None

        return cast(Customer, values[0])

    async def get_customer_by_id(
        self,
        customer_id: str,
    ) -> Customer | None:
        payload = await self._get(f"customers({customer_id})")

        if not payload.get("id"):
            return None

        return cast(Customer, payload)

    async def search_customers(
        self,
        query: str,
    ) -> list[Customer]:
        normalized_query = query.strip()

        if not normalized_query:
            return []

        exact_customer = await self.get_customer(normalized_query)

        if exact_customer is not None:
            return [exact_customer]

        normalized_query = normalized_query.lower()
        safe_query = self._odata_string(normalized_query)

        payload = await self._get(
            "customers",
            {
                "$filter": (f"contains(tolower(displayName),'{safe_query}')"),
                "$schemaversion": "2.1",
                "$top": "10",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[Customer], values)

    async def search_contacts(
        self,
        query: str,
    ) -> list[Contact]:
        normalized_query = " ".join(query.lower().split())

        if not normalized_query:
            return []

        terms = normalized_query.split()
        primary_term = self._odata_string(terms[0])

        payload = await self._get(
            "contacts",
            {
                "$filter": (f"contains(tolower(displayName),'{primary_term}')"),
                "$schemaversion": "2.1",
                "$top": "100",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        contacts = [
            contact for contact in cast(list[Contact], values) if contact.get("type") == "Person"
        ]

        exact_matches = [
            contact
            for contact in contacts
            if contact.get("displayName", "").strip().lower() == normalized_query
        ]

        if exact_matches:
            return exact_matches

        return [
            contact
            for contact in contacts
            if all(
                term
                in " ".join(
                    (
                        contact.get("displayName", ""),
                        contact.get("email", ""),
                        contact.get("companyName", ""),
                    )
                ).lower()
                for term in terms
            )
        ]

    async def get_item(
        self,
        item_number: str,
    ) -> Item | None:
        safe_number = self._odata_string(item_number)

        payload = await self._get(
            "items",
            {
                "$filter": f"number eq '{safe_number}'",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list) or not values:
            return None

        return cast(Item, values[0])

    async def search_items_native(
        self,
        query: str,
    ) -> ItemSearchResult:
        normalized_query = " ".join(query.split())

        if not normalized_query:
            return {
                "status": "invalid_query",
                "query": "",
                "matchedQuery": "",
                "count": 0,
                "items": [],
            }

        payload = await self._post_odata_action(
            "VOICE2ERP_Search_SearchItems",
            {
                "searchText": normalized_query,
            },
        )

        value = payload.get("value")

        if not isinstance(value, str):
            raise BusinessCentralError("Business Central item search did not return a value")

        try:
            decoded: object = json.loads(value)
        except json.JSONDecodeError as exc:
            raise BusinessCentralError(
                "Business Central item search returned invalid JSON"
            ) from exc

        if not isinstance(decoded, dict):
            raise BusinessCentralError("Business Central item search returned an unexpected result")

        search_result = cast(dict[str, object], decoded)

        status = search_result.get("status")
        original_query = search_result.get("query")
        matched_query = search_result.get("matchedQuery")
        count = search_result.get("count")
        raw_items = search_result.get("items")

        if not isinstance(status, str):
            raise BusinessCentralError("Business Central item search returned an invalid status")

        if not isinstance(original_query, str):
            raise BusinessCentralError("Business Central item search returned an invalid query")

        if not isinstance(matched_query, str):
            raise BusinessCentralError(
                "Business Central item search returned an invalid matchedQuery"
            )

        if not isinstance(count, int):
            raise BusinessCentralError("Business Central item search returned an invalid count")

        if not isinstance(raw_items, list):
            raise BusinessCentralError("Business Central item search returned invalid items")

        items: list[ItemSearchCandidate] = []

        for raw_item_object in cast(list[object], raw_items):
            if not isinstance(raw_item_object, dict):
                continue

            raw_item = cast(dict[str, object], raw_item_object)

            number = raw_item.get("number")
            description = raw_item.get("description")
            description2 = raw_item.get("description2")
            unit_price = raw_item.get("unitPrice")
            uom = raw_item.get("uom")
            blocked = raw_item.get("blocked")

            if not isinstance(number, str):
                continue

            if not isinstance(description, str):
                continue

            if not isinstance(description2, str):
                continue

            if isinstance(unit_price, bool) or not isinstance(
                unit_price,
                (int, float),
            ):
                continue

            if not isinstance(uom, str):
                continue

            if not isinstance(blocked, bool):
                continue

            items.append(
                {
                    "number": number,
                    "description": description,
                    "description2": description2,
                    "unitPrice": float(unit_price),
                    "uom": uom,
                    "blocked": blocked,
                }
            )

        return {
            "status": status,
            "query": original_query,
            "matchedQuery": matched_query,
            "count": count,
            "items": items,
        }

    async def search_items(
        self,
        query: str,
    ) -> list[Item]:
        search_result = await self.search_items_native(query)

        items: list[Item] = []

        for candidate in search_result["items"]:
            item = await self.get_item(candidate["number"])

            if item is not None:
                items.append(item)

        return items

    async def get_sales_orders(
        self,
        customer_number: str,
    ) -> list[SalesOrder]:
        safe_number = self._odata_string(customer_number)

        payload = await self._get(
            "salesOrders",
            {
                "$filter": f"customerNumber eq '{safe_number}'",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesOrder], values)

    async def get_sales_quotes(
        self,
        customer_number: str,
    ) -> list[SalesQuote]:
        safe_number = self._odata_string(customer_number)

        payload = await self._get(
            "salesQuotes",
            {
                "$filter": f"customerNumber eq '{safe_number}'",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesQuote], values)

    async def get_sales_invoices(
        self,
        customer_number: str,
    ) -> list[SalesInvoice]:
        safe_number = self._odata_string(customer_number)

        payload = await self._get(
            "salesInvoices",
            {
                "$filter": f"customerNumber eq '{safe_number}'",
                "$top": "100",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesInvoice], values)

    async def get_sales_order_lines(
        self,
        order_id: str,
    ) -> list[SalesOrderLine]:
        payload = await self._get(f"salesOrders({order_id})/salesOrderLines")

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesOrderLine], values)

    async def get_sales_quote(
        self,
        quote_id: str,
    ) -> SalesQuote:
        payload = await self._get(f"salesQuotes({quote_id})")

        return cast(SalesQuote, payload)

    async def get_sales_quote_by_external_document_number(
        self,
        external_document_number: str,
    ) -> SalesQuote | None:
        safe_number = self._odata_string(external_document_number)

        payload = await self._get(
            "salesQuotes",
            {
                "$filter": (f"externalDocumentNumber eq '{safe_number}'"),
                "$top": "2",
            },
        )

        raw_values = payload.get("value")

        if not isinstance(raw_values, list) or not raw_values:
            return None

        values = cast(list[object], raw_values)

        if len(values) > 1:
            raise BusinessCentralError(
                "Multiple sales quotes matched the same external document number"
            )

        first_value = values[0]

        if not isinstance(first_value, dict):
            raise BusinessCentralError("Business Central returned an invalid sales quote")

        return cast(SalesQuote, first_value)

    async def get_sales_quote_lines(
        self,
        quote_id: str,
    ) -> list[SalesQuoteLine]:
        payload = await self._get(f"salesQuotes({quote_id})/salesQuoteLines")

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesQuoteLine], values)

    async def create_sales_quote(
        self,
        *,
        customer_number: str,
        document_date: str,
        external_document_number: str,
    ) -> SalesQuote:
        payload = await self._post(
            "salesQuotes",
            {
                "customerNumber": customer_number,
                "documentDate": document_date,
                "externalDocumentNumber": external_document_number,
            },
        )

        return cast(SalesQuote, payload)

    async def create_sales_quote_line(
        self,
        *,
        quote_id: str,
        item_id: str,
        quantity: float,
    ) -> SalesQuoteLine:
        payload = await self._post(
            f"salesQuotes({quote_id})/salesQuoteLines",
            {
                "itemId": item_id,
                "lineType": "Item",
                "quantity": quantity,
            },
        )

        return cast(SalesQuoteLine, payload)

    async def delete_sales_quote(
        self,
        quote_id: str,
    ) -> None:
        await self._delete(f"salesQuotes({quote_id})")
