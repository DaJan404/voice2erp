from voice2erp.business_central.search import (
    item_matches_query,
    primary_search_term,
    search_term_variants,
)


ITEM = {
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


def test_plural_item_name_matches_singular_business_central_name():
    assert item_matches_query(ITEM, "Atlanta whiteboards")


def test_item_number_matches():
    assert item_matches_query(ITEM, "1996-S")


def test_unrelated_item_name_does_not_match():
    assert not item_matches_query(ITEM, "Athens desk")


def test_primary_search_term_is_normalized():
    assert primary_search_term("  Atlanta whiteboards  ") == "atlanta"


def test_search_term_variants_include_simple_singular():
    assert search_term_variants("whiteboards") == (
        "whiteboards",
        "whiteboard",
    )
