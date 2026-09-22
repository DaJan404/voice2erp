from typing import TypedDict


class Customer(TypedDict):
    id: str
    number: str
    displayName: str
    city: str
    state: str
    country: str
    email: str
    balanceDue: float
    currencyCode: str


class SalesOrder(TypedDict):
    id: str
    number: str
    customerNumber: str
    customerName: str
    orderDate: str
    currencyCode: str
    totalAmountIncludingTax: float
    fullyShipped: bool
    status: str


class SalesQuote(TypedDict):
    id: str
    number: str
    customerNumber: str
    customerName: str
    documentDate: str
    currencyCode: str
    totalAmountIncludingTax: float
    status: str


class SalesOrderLine(TypedDict):
    id: str
    documentId: str
    lineObjectNumber: str
    description: str
    quantity: float
    unitPrice: float
    amountIncludingTax: float
    shippedQuantity: float
    invoicedQuantity: float
