import pytest

from conftest import clientContext


def _create_bin(client, bin_id):
    resp = client.post("/api/bins", json={"id": bin_id, "props": {}})
    assert resp.status_code == 201


def _create_sku(client, sku_id, name):
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
            "name": name,
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


def _create_mixture(client, mix_id, bin_id, sku_id, components):
    payload = {
        "mix_id": mix_id,
        "bin_id": bin_id,
        "sku_id": sku_id,
        "components": [
            {"batch_id": batch_id, "quantity": quantity}
            for batch_id, quantity in components
        ],
        "created_by": "operator",
    }
    resp = client.post("/api/mixtures", json=payload)
    assert resp.status_code == 201


def _create_step_template(client, template_id, name, input_skus, output_skus):
    payload = {
        "template_id": template_id,
        "name": name,
        "description": name,
        "inputs": [{"sku_id": sku_id} for sku_id in input_skus],
        "outputs": [{"sku_id": sku_id} for sku_id in output_skus],
        "metadata": {},
    }
    resp = client.post("/api/step-templates", json=payload)
    assert resp.status_code == 201


def _create_step_instance(client, payload):
    resp = client.post("/api/step-instances", json=payload)
    assert resp.status_code == 201


def _result_by_batch_id(response_json):
    return {item["batch_id"]: item for item in response_json["inputs"]}


def test_traceability_exact_provenance():
    with clientContext() as client:
        input_bin = "BIN100"
        output_bin = "BIN101"
        _create_bin(client, input_bin)
        _create_bin(client, output_bin)

        sku_a = "SKU100"
        sku_b = "SKU101"
        sku_c = "SKU102"
        _create_sku(client, sku_a, "SKU A")
        _create_sku(client, sku_b, "SKU B")
        _create_sku(client, sku_c, "SKU C")

        batch_a = "BAT100"
        batch_b = "BAT101"
        _create_batch(client, batch_a, sku_a, 10)
        _create_batch(client, batch_b, sku_b, 10)
        _add_batch_to_bin(client, input_bin, batch_a, 10)
        _add_batch_to_bin(client, input_bin, batch_b, 10)

        template_id = "TPL100"
        _create_step_template(client, template_id, "Assemble", [sku_a, sku_b], [sku_c])

        produced_batch = "BAT102"
        instance_payload = {
            "instance_id": "INS100",
            "template_id": template_id,
            "operator": {"id": "operator"},
            "consumed": [
                {"resource_id": batch_a, "quantity": 10, "bin_id": input_bin},
                {"resource_id": batch_b, "quantity": 10, "bin_id": input_bin},
            ],
            "produced": [
                {
                    "batch_id": produced_batch,
                    "sku_id": sku_c,
                    "quantity": 10,
                    "bin_id": output_bin,
                }
            ],
        }
        _create_step_instance(client, instance_payload)

        resp = client.post("/api/traceability", json={"batch_ids": [produced_batch]})
        assert resp.status_code == 200
        results = _result_by_batch_id(resp.get_json())

        assert results[batch_a]["lower_bound"] == pytest.approx(10)
        assert results[batch_a]["upper_bound"] == pytest.approx(10)
        assert results[batch_a]["annotations"] == []

        assert results[batch_b]["lower_bound"] == pytest.approx(10)
        assert results[batch_b]["upper_bound"] == pytest.approx(10)
        assert results[batch_b]["annotations"] == []


def test_traceability_mixture_uncertainty_ranges():
    with clientContext() as client:
        input_bin = "BIN200"
        mix_bin = "BIN201"
        output_bin = "BIN202"
        _create_bin(client, input_bin)
        _create_bin(client, mix_bin)
        _create_bin(client, output_bin)

        sku_x = "SKU200"
        sku_y = "SKU201"
        _create_sku(client, sku_x, "SKU X")
        _create_sku(client, sku_y, "SKU Y")

        batch_x1 = "BAT200"
        batch_x2 = "BAT201"
        _create_batch(client, batch_x1, sku_x, 8)
        _create_batch(client, batch_x2, sku_x, 2)
        _add_batch_to_bin(client, mix_bin, batch_x1, 8)
        _add_batch_to_bin(client, mix_bin, batch_x2, 2)

        mixture_id = "MIX200"
        _create_mixture(client, mixture_id, mix_bin, sku_x, [(batch_x1, 8), (batch_x2, 2)])

        template_id = "TPL200"
        _create_step_template(client, template_id, "Blend", [sku_x], [sku_y])

        batch_ya = "BAT202"
        batch_yb = "BAT203"
        batch_yc = "BAT204"
        instance_payload = {
            "instance_id": "INS200",
            "template_id": template_id,
            "operator": {"id": "operator"},
            "consumed": [
                {"resource_id": mixture_id, "quantity": 10, "bin_id": mix_bin},
            ],
            "produced": [
                {
                    "batch_id": batch_ya,
                    "sku_id": sku_y,
                    "quantity": 7,
                    "bin_id": output_bin,
                },
                {
                    "batch_id": batch_yb,
                    "sku_id": sku_y,
                    "quantity": 2,
                    "bin_id": output_bin,
                },
                {
                    "batch_id": batch_yc,
                    "sku_id": sku_y,
                    "quantity": 1,
                    "bin_id": output_bin,
                },
            ],
        }
        _create_step_instance(client, instance_payload)

        resp = client.post("/api/traceability", json={"batch_ids": [batch_ya]})
        assert resp.status_code == 200
        results = _result_by_batch_id(resp.get_json())

        assert results[batch_x1]["lower_bound"] == pytest.approx(5)
        assert results[batch_x1]["upper_bound"] == pytest.approx(7)
        assert set(results[batch_x1]["annotations"]) == {
            "complement-capacity",
            "mixture-allocation",
        }

        assert results[batch_x2]["lower_bound"] == pytest.approx(0)
        assert results[batch_x2]["upper_bound"] == pytest.approx(2)
        assert set(results[batch_x2]["annotations"]) == {
            "complement-capacity",
            "mixture-allocation",
        }

        resp = client.post(
            "/api/traceability",
            json={"batch_ids": [batch_ya, batch_yb]},
        )
        assert resp.status_code == 200
        results = _result_by_batch_id(resp.get_json())

        assert results[batch_x1]["lower_bound"] == pytest.approx(7)
        assert results[batch_x1]["upper_bound"] == pytest.approx(8)
        assert results[batch_x2]["lower_bound"] == pytest.approx(1)
        assert results[batch_x2]["upper_bound"] == pytest.approx(2)


def test_traceability_multi_step_flow():
    with clientContext() as client:
        raw_bin = "BIN300"
        first_mix_bin = "BIN301"
        second_mix_bin = "BIN302"
        final_output_bin = "BIN303"
        _create_bin(client, raw_bin)
        _create_bin(client, first_mix_bin)
        _create_bin(client, second_mix_bin)
        _create_bin(client, final_output_bin)

        sku_x = "SKU300"
        sku_y = "SKU301"
        sku_z = "SKU302"
        _create_sku(client, sku_x, "SKU X")
        _create_sku(client, sku_y, "SKU Y")
        _create_sku(client, sku_z, "SKU Z")

        batch_x1 = "BAT300"
        batch_x2 = "BAT301"
        _create_batch(client, batch_x1, sku_x, 8)
        _create_batch(client, batch_x2, sku_x, 2)
        _add_batch_to_bin(client, first_mix_bin, batch_x1, 8)
        _add_batch_to_bin(client, first_mix_bin, batch_x2, 2)

        first_mix = "MIX300"
        _create_mixture(client, first_mix, first_mix_bin, sku_x, [(batch_x1, 8), (batch_x2, 2)])

        template_first = "TPL300"
        _create_step_template(client, template_first, "Blend", [sku_x], [sku_y])

        batch_ya = "BAT302"
        batch_yb = "BAT303"
        batch_yc = "BAT304"
        first_instance_payload = {
            "instance_id": "INS300",
            "template_id": template_first,
            "operator": "operator",
            "consumed": [
                {"resource_id": first_mix, "quantity": 10, "bin_id": first_mix_bin},
            ],
            "produced": [
                {
                    "batch_id": batch_ya,
                    "sku_id": sku_y,
                    "quantity": 7,
                    "bin_id": second_mix_bin,
                },
                {
                    "batch_id": batch_yb,
                    "sku_id": sku_y,
                    "quantity": 2,
                    "bin_id": second_mix_bin,
                },
                {
                    "batch_id": batch_yc,
                    "sku_id": sku_y,
                    "quantity": 1,
                    "bin_id": second_mix_bin,
                },
            ],
        }
        _create_step_instance(client, first_instance_payload)

        second_mix = "MIX301"
        _create_mixture(
            client,
            second_mix,
            second_mix_bin,
            sku_y,
            [(batch_ya, 7), (batch_yb, 2), (batch_yc, 1)],
        )

        template_second = "TPL301"
        _create_step_template(client, template_second, "Pack", [sku_y], [sku_z])

        batch_z = "BAT305"
        second_instance_payload = {
            "instance_id": "INS301",
            "template_id": template_second,
            "operator": {"id": "operator"},
            "consumed": [
                {"resource_id": second_mix, "quantity": 2, "bin_id": second_mix_bin},
            ],
            "produced": [
                {
                    "batch_id": batch_z,
                    "sku_id": sku_z,
                    "quantity": 2,
                    "bin_id": final_output_bin,
                }
            ],
        }
        _create_step_instance(client, second_instance_payload)

        resp = client.post("/api/traceability", json={"batch_ids": [batch_z]})
        assert resp.status_code == 200
        results = _result_by_batch_id(resp.get_json())

        assert results[batch_x1]["lower_bound"] == pytest.approx(0)
        assert results[batch_x1]["upper_bound"] == pytest.approx(2)
        assert "complement-capacity" in results[batch_x1]["annotations"]
        assert "mixture-allocation" in results[batch_x1]["annotations"]

        assert results[batch_x2]["lower_bound"] == pytest.approx(0)
        assert results[batch_x2]["upper_bound"] == pytest.approx(2)
        assert "complement-capacity" in results[batch_x2]["annotations"]
        assert "mixture-allocation" in results[batch_x2]["annotations"]
