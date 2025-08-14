"""Regression test capturing the bin-creation cost_per_case issue."""

from conftest import clientContext


def test_bin_creation_with_none_cost_per_case():
    """Expect creating a bin with a `None` cost_per_case to succeed."""
    with clientContext() as client:
        resp = client.post(
            "/api/bins",
            json={"id": "BIN123456", "props": {"cost_per_case": None}},
        )
        assert resp.status_code == 201
