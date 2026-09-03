import hmac


def validate_tool_token(expected_token, provided_token):
    if not isinstance(expected_token, str) or not expected_token.strip():
        return 503

    if not isinstance(provided_token, str) or not provided_token.strip():
        return 401

    if not hmac.compare_digest(provided_token, expected_token):
        return 401

    return None
