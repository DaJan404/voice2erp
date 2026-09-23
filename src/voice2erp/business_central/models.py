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


class Contact(TypedDict):
    id: str
    number: str
    type: str
    displayName: str
    jobTitle: str
    companyNumber: str
    companyName: str
    phoneNumber: str
    mobilePhoneNumber: str
    email: str


class Item(TypedDict):
    id: str
    number: str
    displayName: str
    displayName2: str
    type: str
    blocked: bool
    inventory: float
    unitPrice: float
    priceIncludesTax: bool
    baseUnitOfMeasureCode: str


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
    externalDocumentNumber: NotRequired[str]


class SalesQuoteLine(TypedDict):
    id: str
    documentId: str
    sequence: int
    itemId: str
    lineType: str
    lineObjectNumber: str
    description: str
    unitOfMeasureCode: str
    unitPrice: float
    quantity: float
    amountExcludingTax: float
    totalTaxAmount: float
    amountIncludingTax: float


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
