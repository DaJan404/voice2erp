# Business Central integration

[Documentation index](README.md)

The [client](../src/voice2erp/business_central/client.py) uses `workers.fetch` to call Entra and Business Central. Business Central is the runtime source of truth; there is no in-memory production substitute for a failed ERP call.

## Identity and endpoints

The Worker reads `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_ENVIRONMENT`, and `BC_COMPANY_ID`. It requests an Entra OAuth token with `grant_type=client_credentials` and scope `https://api.businesscentral.dynamics.com/.default`.

Standard API requests target:

```text
https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({company_id})
```

The native resolver uses:

```text
POST .../v2.0/{tenant}/{environment}/ODataV4/VOICE2ERP_Search_SearchItems?company={company_id}
Body: {"searchText": "whiteboards"}
```

The OData result's `value` contains a JSON string that the client decodes and checks. The client caches the bearer token on its own instance, with a 60-second expiry margin. Worker handlers construct clients per request; this is not a shared durable token cache.

## Read resources

| Resource | Current use |
| --- | --- |
| `customers` | Exact number first, then name search; customer contact details and balance |
| `contacts` | Person lookup, followed by customer search using `companyName` |
| `items` | Fetch canonical item details by returned item number |
| `salesOrders` / lines | Counts/value, recent and largest order context; lines for largest order |
| `salesQuotes` / lines | Existing quote summary, marker lookup and post-write verification |
| `salesInvoices` | Open remaining amounts, overdue evidence and balance comparison |

Customer name search is capped at 10 results; invoice retrieval requests up to 100. The client does not follow general pagination links. Briefings return up to three recent orders and five open-invoice evidence rows. Totals summarize retrieved records, not guaranteed complete history. A contact is mapped through a company-name lookup, not an assumed immutable relational key.

The briefing compares retrieved remaining invoice amounts with `balanceDue`. A difference is explicitly represented; it is not evidence of disputes or payment-delay causes. Sales labels such as “open orders” reflect the currently retrieved order set rather than a separate full ledger reconciliation.

## Mutations

Execution creates a `salesQuotes` header with customer number, UTC document date, and an external request marker, then an Item line using the canonical item ID and quantity. Business Central calculates pricing. No quote sending, posting, or invoice creation is implemented.

If line creation raises a Business Central error, the service attempts to delete the new header. This is best-effort compensation, not a transaction. The [quote workflow](quote-workflow.md) documents recovery and verification limits.

## AL deployment

[The extension manifest](../bc-extension/app.json) targets Business Central application/platform 28 with AL runtime 17.1. [Codeunit 50100](../bc-extension/src/Search/ItemSearch.Codeunit.al) implements `SearchItems`. The sandbox must have the extension installed and the codeunit published under the web-service name expected by `VOICE2ERP_Search_SearchItems` (service name `VOICE2ERP_Search`). Local source presence alone does not publish the service.

Entra application permissions, tenant consent, Business Central application registration, and appropriate permission sets are provisioning prerequisites. Their live configuration is not stored or verified by the repository. See [deployment](deployment.md) and [item resolution](item-resolution.md).
