from conftest import clientContext


def test_bin_creation_with_none_cost_per_case():
    with clientContext() as client:
        resp = client.post('/api/bins', json={'id': 'BIN123456', 'props': {'cost_per_case': None}})
        assert resp.status_code == 201
