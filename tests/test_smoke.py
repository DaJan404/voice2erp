from voice2erp.security import validate_tool_token


def test_missing_worker_secret_fails_closed():
    assert validate_tool_token(None, "some-token") == 503


def test_empty_worker_secret_fails_closed():
    assert validate_tool_token("", "some-token") == 503


def test_missing_request_token_is_unauthorized():
    assert validate_tool_token("secret-token", None) == 401


def test_empty_request_token_is_unauthorized():
    assert validate_tool_token("secret-token", "") == 401


def test_wrong_request_token_is_unauthorized():
    assert validate_tool_token("secret-token", "wrong-token") == 401


def test_valid_token_is_accepted():
    assert validate_tool_token("secret-token", "secret-token") is None
