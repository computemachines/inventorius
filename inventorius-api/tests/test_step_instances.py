import pytest

from inventorius.data_models import Batch, Bin, Mixture, StepInstance, StepTemplate
from inventorius.db import get_mongo_client

from conftest import clientContext


def _create_bin(client, bin_id):
    resp = client.post("/api/bins", json={"id": bin_id, "props": {}})
    assert resp.status_code == 201


def _create_sku(client, sku_id, name="Test SKU"):
    resp = client.post(
        "/api/skus",
        json={
            "id": sku_id,
            "name": name,
            "owned_codes": [],
            "associated_codes": [],
            "props": {},
        },
    )
    assert resp.status_code == 201


def _create_batch(client, batch_id, sku_id, qty, name="Batch"):
    resp = client.post(
        "/api/batches",
        json={
            "id": batch_id,
            "sku_id": sku_id,
            "owned_codes": [],
            "associated_codes": [],
            "props": {},
            "qty_remaining": qty,
            "name": name,
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
            {"batch_id": batch_id, "quantity": quantity} for batch_id, quantity in components
        ],
        "created_by": created_by,
    }
    resp = client.post("/api/mixtures", json=payload)
    assert resp.status_code == 201


def test_step_instance_consumes_inputs_and_creates_outputs():
    with clientContext() as client:
        input_bin = "BIN500"
        mixture_bin = "BIN501"
        output_bin = "BIN600"
        _create_bin(client, input_bin)
        _create_bin(client, mixture_bin)
        _create_bin(client, output_bin)

        sku_primary = "SKU900"
        sku_secondary = "SKU901"
        sku_output = "SKU950"
        _create_sku(client, sku_primary, name="Primary")
        _create_sku(client, sku_secondary, name="Secondary")
        _create_sku(client, sku_output, name="Output")

        template_payload = {
            "template_id": "TPL100",
            "name": "Blend and Pack",
            "description": "Combine inputs and package",
            "inputs": [
                {"sku_id": sku_primary, "role": "primary"},
                {"sku_id": sku_secondary, "role": "secondary"},
            ],
            "outputs": [{"sku_id": sku_output, "form": "case"}],
            "metadata": {"equipment": "MIX-01"},
        }
        resp = client.post("/api/step-templates", json=template_payload)
        assert resp.status_code == 201

        _create_batch(client, "BAT900", sku_primary, 10)
        _add_batch_to_bin(client, input_bin, "BAT900", 10)

        secondary_components = [("BAT901", 5), ("BAT902", 5)]
        for batch_id, qty in secondary_components:
            _create_batch(client, batch_id, sku_secondary, qty)
            _add_batch_to_bin(client, mixture_bin, batch_id, qty)
        _create_mixture(client, "MIX500", mixture_bin, sku_secondary, secondary_components)

        instance_payload = {
            "instance_id": "INS100",
            "template_id": "TPL100",
            "operator": {"id": "operator-1", "name": "Alex"},
            "notes": "Trial production run",
            "consumed": [
                {"resource_id": "BAT900", "quantity": 4, "bin_id": input_bin},
                {"resource_id": "MIX500", "quantity": 3, "bin_id": mixture_bin},
            ],
            "produced": [
                {
                    "batch_id": "BAT950",
                    "sku_id": sku_output,
                    "quantity": 4,
                    "bin_id": output_bin,
                },
                {
                    "batch_id": "BAT951",
                    "sku_id": sku_output,
                    "quantity": 2,
                    "bin_id": output_bin,
                },
            ],
        }

        resp = client.post("/api/step-instances", json=instance_payload)
        assert resp.status_code == 201

        db = get_mongo_client().testing

        stored_template = StepTemplate.from_mongodb_doc(
            db.step_template.find_one({"_id": "TPL100"})
        )
        assert stored_template is not None
        assert stored_template.name == "Blend and Pack"

        stored_instance = StepInstance.from_mongodb_doc(
            db.step_instance.find_one({"_id": "INS100"})
        )
        assert stored_instance is not None
        assert len(stored_instance.consumed) == 2
        assert len(stored_instance.produced) == 2
        assert stored_instance.produced[0]["batch_id"] in {"BAT950", "BAT951"}

        primary_batch = Batch.from_mongodb_doc(db.batch.find_one({"_id": "BAT900"}))
        assert primary_batch.qty_remaining == pytest.approx(6)
        assert primary_batch.produced_by_instance is None

        mixture_state = Mixture.from_mongodb_doc(db.mixture.find_one({"_id": "MIX500"}))
        assert mixture_state.qty_total == pytest.approx(7)
        remaining_components = {
            component["batch_id"]: component["qty_remaining"]
            for component in mixture_state.components
        }
        assert remaining_components["BAT901"] == pytest.approx(3.5)
        assert remaining_components["BAT902"] == pytest.approx(3.5)

        input_bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": input_bin}))
        assert input_bin_state.contents["BAT900"] == pytest.approx(6)

        mixture_bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": mixture_bin}))
        assert mixture_bin_state.contents["MIX500"] == pytest.approx(7)

        produced_a = Batch.from_mongodb_doc(db.batch.find_one({"_id": "BAT950"}))
        produced_b = Batch.from_mongodb_doc(db.batch.find_one({"_id": "BAT951"}))
        assert produced_a.produced_by_instance == "INS100"
        assert produced_b.produced_by_instance == "INS100"
        assert produced_a.qty_remaining == pytest.approx(4)
        assert produced_b.qty_remaining == pytest.approx(2)

        output_bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": output_bin}))
        assert output_bin_state.contents["BAT950"] == pytest.approx(4)
        assert output_bin_state.contents["BAT951"] == pytest.approx(2)
