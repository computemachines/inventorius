import pytest

from conftest import clientContext
from inventorius.data_models import Batch, Bin, Mixture
from inventorius.db import get_mongo_client


def _create_bin(client, bin_id):
    resp = client.post("/api/bins", json={"id": bin_id, "props": {}})
    assert resp.status_code == 201


def _create_sku(client, sku_id):
    resp = client.post(
        "/api/skus",
        json={
            "id": sku_id,
            "name": "Test SKU",
            "owned_codes": [],
            "associated_codes": [],
            "props": {},
        },
    )
    assert resp.status_code == 201


def _create_batch(client, batch_id, sku_id, qty):
    resp = client.post(
        "/api/batches",
        json={
            "id": batch_id,
            "sku_id": sku_id,
            "owned_codes": [],
            "associated_codes": [],
            "props": {},
            "qty_remaining": qty,
        },
    )
    assert resp.status_code == 201


def _add_batch_to_bin(client, bin_id, batch_id, qty):
    resp = client.post(
        f"/api/bin/{bin_id}/contents",
        json={"id": batch_id, "quantity": qty},
    )
    assert resp.status_code == 201


def _create_mixture(client, mix_id, bin_id, sku_id, components, created_by="operator"):
    payload = {
        "mix_id": mix_id,
        "bin_id": bin_id,
        "sku_id": sku_id,
        "components": [
            {"batch_id": batch_id, "quantity": quantity}
            for batch_id, quantity in components
        ],
        "created_by": created_by,
    }
    resp = client.post("/api/mixtures", json=payload)
    assert resp.status_code == 201
    return resp.json


def _bootstrap_mixture(client, mix_id, components, *, bin_id="BIN100", sku_id="SKU100"):
    _create_bin(client, bin_id)
    _create_sku(client, sku_id)
    for batch_id, quantity in components:
        _create_batch(client, batch_id, sku_id, quantity)
        _add_batch_to_bin(client, bin_id, batch_id, quantity)
    return _create_mixture(client, mix_id, bin_id, sku_id, components)


def test_mixture_creation_updates_batches_and_bin():
    with clientContext() as client:
        mix_id = "MIX100"
        components = [("BAT100", 6), ("BAT101", 4)]
        _bootstrap_mixture(client, mix_id, components)

        db = get_mongo_client().testing
        stored = Mixture.from_mongodb_doc(db.mixture.find_one({"_id": mix_id}))
        assert stored is not None
        assert stored.qty_total == pytest.approx(10)
        assert len(stored.components) == 2
        component_totals = {
            comp["batch_id"]: comp for comp in stored.components
        }
        assert component_totals["BAT100"]["qty_initial"] == pytest.approx(6)
        assert component_totals["BAT100"]["qty_remaining"] == pytest.approx(6)
        assert component_totals["BAT101"]["qty_initial"] == pytest.approx(4)
        assert component_totals["BAT101"]["qty_remaining"] == pytest.approx(4)

        batch_a = Batch.from_mongodb_doc(db.batch.find_one({"_id": "BAT100"}))
        batch_b = Batch.from_mongodb_doc(db.batch.find_one({"_id": "BAT101"}))
        assert batch_a.qty_remaining == pytest.approx(0)
        assert batch_b.qty_remaining == pytest.approx(0)

        bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": "BIN100"}))
        assert bin_state.contents.get(mix_id, 0) == pytest.approx(10)
        assert "BAT100" not in bin_state.contents
        assert "BAT101" not in bin_state.contents


def test_mixture_draw_updates_components_and_bin_totals():
    with clientContext() as client:
        mix_id = "MIX200"
        components = [("BAT200", 6), ("BAT201", 4)]
        _bootstrap_mixture(client, mix_id, components)

        resp = client.post(
            f"/api/mixture/{mix_id}/draw",
            json={"quantity": 5, "created_by": "operator"},
        )
        assert resp.status_code == 200

        db = get_mongo_client().testing
        stored = Mixture.from_mongodb_doc(db.mixture.find_one({"_id": mix_id}))
        assert stored.qty_total == pytest.approx(5)
        remaining = {comp["batch_id"]: comp["qty_remaining"] for comp in stored.components}
        assert remaining["BAT200"] == pytest.approx(3)
        assert remaining["BAT201"] == pytest.approx(2)

        bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": "BIN100"}))
        assert bin_state.contents[mix_id] == pytest.approx(5)


def test_mixture_split_creates_new_mixture_with_proportions():
    with clientContext() as client:
        source_mix = "MIX300"
        components = [("BAT300", 8), ("BAT301", 4)]
        _bootstrap_mixture(client, source_mix, components)

        _create_bin(client, "BIN200")
        resp = client.post(
            f"/api/mixture/{source_mix}/split",
            json={
                "quantity": 6,
                "destination_bin": "BIN200",
                "new_mix_id": "MIX301",
                "created_by": "splitter",
            },
        )
        assert resp.status_code == 201

        db = get_mongo_client().testing
        source = Mixture.from_mongodb_doc(db.mixture.find_one({"_id": source_mix}))
        split = Mixture.from_mongodb_doc(db.mixture.find_one({"_id": "MIX301"}))

        assert source.qty_total == pytest.approx(6)
        remaining = {comp["batch_id"]: comp["qty_remaining"] for comp in source.components}
        assert remaining["BAT300"] == pytest.approx(4)
        assert remaining["BAT301"] == pytest.approx(2)

        assert split.qty_total == pytest.approx(6)
        split_components = {comp["batch_id"]: comp["qty_remaining"] for comp in split.components}
        assert split_components["BAT300"] == pytest.approx(4)
        assert split_components["BAT301"] == pytest.approx(2)
        assert split.bin_id == "BIN200"

        source_bin = Bin.from_mongodb_doc(db.bin.find_one({"_id": "BIN100"}))
        dest_bin = Bin.from_mongodb_doc(db.bin.find_one({"_id": "BIN200"}))
        assert source_bin.contents[source_mix] == pytest.approx(6)
        assert dest_bin.contents["MIX301"] == pytest.approx(6)


def test_mixture_hypermedia_operations_present():
    with clientContext() as client:
        mix_id = "MIX400"
        components = [("BAT400", 5), ("BAT401", 5)]
        created = _bootstrap_mixture(client, mix_id, components)

        assert created["Id"].endswith(f"/api/mixture/{mix_id}")
        operations = {op["rel"]: op for op in created["operations"]}
        assert set(operations.keys()) == {"draw", "split", "append-audit"}
        expected_suffix = {
            "draw": "/draw",
            "split": "/split",
            "append-audit": "/audit",
        }
        for rel, op in operations.items():
            assert op["method"] == "POST"
            assert op["href"].endswith(f"/api/mixture/{mix_id}{expected_suffix[rel]}")

        fetched = client.get(f"/api/mixture/{mix_id}")
        assert fetched.status_code == 200
        fetched_operations = {op["rel"] for op in fetched.json["operations"]}
        assert fetched_operations == {"draw", "split", "append-audit"}
