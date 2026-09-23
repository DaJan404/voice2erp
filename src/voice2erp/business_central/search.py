import re

from voice2erp.business_central.models import Item


def normalize_search_term(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "", value.lower())


def search_term_variants(value: str) -> tuple[str, ...]:
    normalized = normalize_search_term(value)

    if not normalized:
        return ()

    variants = [normalized]

    if len(normalized) > 3 and normalized.endswith("s"):
        variants.append(normalized[:-1])

    return tuple(dict.fromkeys(variants))


def primary_search_term(query: str) -> str:
    for raw_term in query.split():
        variants = search_term_variants(raw_term)

        if variants:
            return variants[0]

    return ""


def item_matches_query(item: Item, query: str) -> bool:
    query_terms = [
        search_term_variants(raw_term)
        for raw_term in query.split()
    ]
    query_terms = [variants for variants in query_terms if variants]

    if not query_terms:
        return False

    haystack = " ".join(
        (
            item.get("number", ""),
            item.get("displayName", ""),
            item.get("displayName2", ""),
        )
    ).lower()

    return all(
        any(variant in haystack for variant in variants)
        for variants in query_terms
    )
