from typing import NotRequired, TypedDict


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
    phoneNumber: NotRequired[str]
    website: NotRequired[str]


class CustomerContact(TypedDict):
    id: str
    email: str
    firstName: str
    lastName: str
    professionalTitle: str
    customerId: str
    customerName: str
    primaryPhoneNumber: str


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


class SalesInvoice(TypedDict):
    id: str
    number: str
    invoiceDate: str
    postingDate: str
    dueDate: str
    customerNumber: str
    customerName: str
    currencyCode: str
    remainingAmount: float
    totalAmountIncludingTax: float
    status: str
    disputeStatus: NotRequired[str]
    shipToContact: NotRequired[str]


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
