# Item resolution

[Documentation index](README.md)

Natural language belongs to the agent; item identity belongs to Business Central. The agent calls `search_items` before preparing a product described by name. It must not guess an item number from conversational similarity.

## Current AL algorithm

[Codeunit 50100](../bc-extension/src/Search/ItemSearch.Codeunit.al) performs:

1. Trim input; return `invalid_query` for an empty value.
2. Try `Item.Get(SearchText)`. An exact item number wins immediately.
3. Search the `Description` field with the native filter expression `'&&' + SearchText + '*'`.
4. Only when that search returns zero rows and the term ends in `s`, remove the last character and search again.
5. Return up to five candidates: zero means `not_found`, one means `resolved`, more than one means `ambiguous`.

The fallback handles a simple case such as “whiteboards” → “whiteboard.” It is not a linguistic stemmer, synonym model, or general plural resolver. `Description 2` is returned as metadata but is not searched by `FindItems`. A capped `count` is the number returned, not the total number of possible matching records.

Each candidate includes number, description, secondary description, reference unit price, unit of measure, and blocked status. Preparation retrieves canonical item details through the standard API and rejects a blocked item.

## Ambiguity is a user decision

For “five white items,” the search may produce:

- `1996-S — ATLANTA Whiteboard, base`
- `SP-BOM3003 — Paint, white`

The agent must ask which returned item the user means. “The first one” selects the first candidate in the actual response, using its exact number. The catalog does not impose a sort order, and this example does not guarantee those are the only possible current matches.

If nothing matches, the user clarifies. If preparation itself returns multiple items, the agent must also ask rather than silently choosing.

## Testing boundary

[test_item_search.py](../tests/test_item_search.py) tests the Python helpers in [search.py](../src/voice2erp/business_central/search.py). Those helpers are not called by the current Business Central client or AL runtime path. Their passing tests do not establish the correctness of native filtering, OData publication, plural fallback, or live ambiguity behavior. Use the [manual demo scenarios](demo-guide.md) to evaluate the deployed resolver; AL automated tests remain future work.
