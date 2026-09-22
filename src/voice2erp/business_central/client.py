import json
import time
from dataclasses import dataclass
from http import HTTPMethod
from typing import Protocol, cast
from urllib.parse import urlencode

from workers import fetch

from voice2erp.business_central.models import (
    Customer,
    SalesOrder,
    SalesOrderLine,
    SalesQuote,
)


class FetchResponseLike(Protocol):
    ok: bool
    status: int

    async def text(self) -> str: ...


class BusinessCentralError(RuntimeError):
    pass


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

        safe_query = self._odata_string(normalized_query)

        payload = await self._get(
            "customers",
            {
                "$filter": f"contains(displayName,'{safe_query}')",
                "$top": "10",
            },
        )

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[Customer], values)

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

    async def get_sales_order_lines(
        self,
        order_id: str,
    ) -> list[SalesOrderLine]:
        payload = await self._get(f"salesOrders({order_id})/salesOrderLines")

        values = payload.get("value")

        if not isinstance(values, list):
            return []

        return cast(list[SalesOrderLine], values)
