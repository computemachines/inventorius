import json
from datetime import datetime, timezone
from decimal import Decimal, getcontext

from flask import Blueprint, Response, request
from voluptuous.error import Invalid, MultipleInvalid

from inventorius.data_models import (
    Batch,
    Bin,
    DataModelJSONEncoder as Encoder,
    Mixture,
    mixture_components_to_bson,
    quantity_to_bson,
)
from inventorius.db import db
from inventorius.validation import (
    mixture_create_schema,
    mixture_draw_schema,
    mixture_split_schema,
)
from inventorius.util import no_cache
import inventorius.util_error_responses as problem

getcontext().prec = 28

mixture = Blueprint("mixture", __name__)


def _as_decimal(value):
    return Decimal(str(value))


def _timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_audit_event(event_type, created_by, details=None, note=None):
    event = {
        "event": event_type,
        "created_by": created_by,
        "timestamp": _timestamp(),
    }
    if details is not None:
        event["details"] = details
    if note:
        event["note"] = note
    return event


def _proportional_allocation(components, quantity):
    total = sum(
        _as_decimal(component.get("qty_remaining", 0)) for component in components
    )
    requested = _as_decimal(quantity)
    if requested > total:
        raise ValueError(f"insufficient quantity in mixture: requested {requested}, available {total}")

    allocated = Decimal("0")
    remaining_components = []
    extracted_components = []

    for index, component in enumerate(components):
        current_remaining = _as_decimal(component.get("qty_remaining", 0))
        qty_initial_value = component.get(
            "qty_initial", component.get("qty_remaining", 0)
        )
        if total == 0:
            share = Decimal("0")
        else:
            share = current_remaining / total

        if index == len(components) - 1:
            take = requested - allocated
        else:
            take = (requested * share).quantize(Decimal("0.0000001"))
        if take > current_remaining:
            take = current_remaining
        if take < Decimal("0"):
            take = Decimal("0")

        allocated += take
        remaining_value = current_remaining - take
        if remaining_value < Decimal("0"):
            take += remaining_value
            remaining_value = Decimal("0")

        remaining_components.append(
            {
                "batch_id": component["batch_id"],
                "qty_initial": float(qty_initial_value),
                "qty_remaining": float(remaining_value),
            }
        )
        extracted_components.append(
            {
                "batch_id": component["batch_id"],
                "qty_initial": float(take),
                "qty_remaining": float(take),
            }
        )

    difference = requested - allocated
    if difference != Decimal("0") and extracted_components:
        last_remaining = _as_decimal(remaining_components[-1]["qty_remaining"]) - difference
        last_extracted = _as_decimal(extracted_components[-1]["qty_initial"]) + difference
        if last_remaining < Decimal("0"):
            last_extracted += last_remaining
            last_remaining = Decimal("0")
        remaining_components[-1]["qty_remaining"] = float(last_remaining)
        extracted_components[-1]["qty_initial"] = float(last_extracted)
        extracted_components[-1]["qty_remaining"] = float(last_extracted)

    return remaining_components, extracted_components


def _mixture_response(payload, status):
    resp = Response()
    resp.status_code = status
    resp.mimetype = "application/json"
    resp.data = json.dumps(payload, cls=Encoder)
    return resp


def _normalize_components(components):
    normalized = []
    for component in components:
        normalized.append(
            {
                "batch_id": component["batch_id"],
                "qty_initial": float(component["qty_initial"]),
                "qty_remaining": float(component["qty_remaining"]),
            }
        )
    return normalized


def _insufficient_quantity_error(index, available, requested):
    return MultipleInvalid(
        [
            Invalid(
                f"requested {requested}, but only {available} is available",
                path=["components", index, "quantity"],
            )
        ]
    )


def get_mixture(mix_id):
    return Mixture.from_mongodb_doc(db.mixture.find_one({"_id": mix_id}))


@mixture.route("/api/mixtures", methods=["POST"])
@no_cache
def mixtures_post():
    try:
        payload = mixture_create_schema(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    if Mixture.from_mongodb_doc(db.mixture.find_one({"_id": payload["mix_id"]})):
        return problem.duplicate_resource_response("mix_id")

    bin_doc = Bin.from_mongodb_doc(db.bin.find_one({"_id": payload["bin_id"]}))
    if bin_doc is None:
        return problem.missing_bin_response(payload["bin_id"])

    if not db.sku.find_one({"_id": payload["sku_id"]}):
        return problem.missing_sku_response(payload["sku_id"])

    component_batches = []
    total_requested = Decimal("0")
    for index, component in enumerate(payload["components"]):
        batch = Batch.from_mongodb_doc(db.batch.find_one({"_id": component["batch_id"]}))
        if batch is None:
            return problem.missing_batch_response(component["batch_id"])
        if batch.sku_id != payload["sku_id"]:
            error = MultipleInvalid(
                [
                    Invalid(
                        "batch SKU does not match mixture SKU",
                        path=["components", index, "batch_id"],
                    )
                ]
            )
            return problem.invalid_params_response(error)

        quantity = _as_decimal(component["quantity"])
        available_in_bin = Decimal(str(bin_doc.contents.get(batch.id, 0)))
        batch_remaining = Decimal(str(batch.qty_remaining or 0))

        if available_in_bin < quantity:
            error = _insufficient_quantity_error(
                index, available_in_bin, quantity
            )
            return problem.invalid_params_response(
                error, type="insufficient-quantity", status_code=405
            )
        if batch_remaining < quantity:
            error = _insufficient_quantity_error(
                index, batch_remaining, quantity
            )
            return problem.invalid_params_response(
                error, type="insufficient-quantity", status_code=405
            )

        component_batches.append((batch, quantity))
        total_requested += quantity

    if total_requested <= Decimal("0"):
        error = MultipleInvalid(
            [Invalid("mixtures must contain a positive quantity", path=["components"])]
        )
        return problem.invalid_params_response(error)

    components_state = []
    for batch, quantity in component_batches:
        new_qty = Decimal(str(batch.qty_remaining or 0)) - quantity
        db.batch.update_one(
            {"_id": batch.id},
            {"$set": {"qty_remaining": quantity_to_bson(float(new_qty))}},
        )

        db.bin.update_one(
            {"_id": payload["bin_id"]},
            {"$inc": {f"contents.{batch.id}": -float(quantity)}}
        )
        db.bin.update_one(
            {"_id": payload["bin_id"], f"contents.{batch.id}": 0},
            {"$unset": {f"contents.{batch.id}": ""}},
        )

        quantity_float = float(quantity)
        components_state.append(
            {
                "batch_id": batch.id,
                "qty_initial": quantity_float,
                "qty_remaining": quantity_float,
            }
        )

    mixture_state = Mixture(
        mix_id=payload["mix_id"],
        sku_id=payload["sku_id"],
        bin_id=payload["bin_id"],
        components=components_state,
        qty_total=float(total_requested),
        created_by=payload["created_by"],
    )

    audit_entry = build_audit_event(
        "created",
        payload["created_by"],
        details={"components": _normalize_components(components_state)},
    )
    initial_audit = [audit_entry]
    if payload.get("audit"):
        initial_audit.extend(payload["audit"])
    mixture_state.audit = initial_audit

    db.mixture.insert_one(mixture_state.to_mongodb_doc())
    db.bin.update_one(
        {"_id": payload["bin_id"]},
        {"$inc": {f"contents.{payload['mix_id']}": float(total_requested)}},
    )

    response_payload = {
        "state": mixture_state.to_dict(),
        "operations": [],
    }
    return _mixture_response(response_payload, 201)


@mixture.route("/api/mixture/<mix_id>", methods=["GET"])
@no_cache
def mixture_get(mix_id):
    existing = get_mixture(mix_id)
    if existing is None:
        return problem.missing_mixture_response(mix_id)

    return _mixture_response({"state": existing.to_dict(), "operations": []}, 200)


def apply_draw(mixture_state, quantity, created_by, note=None):
    remaining_components, extracted_components = _proportional_allocation(
        mixture_state.components, quantity
    )

    mixture_state.components = remaining_components
    mixture_state.qty_total = sum(
        component["qty_remaining"] for component in remaining_components
    )

    event = build_audit_event(
        "draw",
        created_by,
        details={"quantity": quantity, "components": extracted_components},
        note=note,
    )
    return mixture_state, event, extracted_components


@mixture.route("/api/mixture/<mix_id>/draw", methods=["POST"])
@no_cache
def mixture_draw(mix_id):
    try:
        payload = mixture_draw_schema(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    existing = get_mixture(mix_id)
    if existing is None:
        return problem.missing_mixture_response(mix_id)

    quantity = float(payload["quantity"])
    if quantity > existing.qty_total:
        error = MultipleInvalid(
            [Invalid("requested quantity exceeds mixture total", path=["quantity"])]
        )
        return problem.invalid_params_response(
            error, type="insufficient-quantity", status_code=405
        )

    updated_mixture, event, extracted = apply_draw(
        existing, quantity, payload["created_by"], payload.get("note")
    )

    db.mixture.update_one(
        {"_id": mix_id},
        {
            "$set": {
                "components": mixture_components_to_bson(updated_mixture.components),
                "qty_total": quantity_to_bson(updated_mixture.qty_total),
            },
            "$push": {"audit": event},
        },
    )
    db.bin.update_one(
        {"_id": updated_mixture.bin_id},
        {"$inc": {f"contents.{mix_id}": -quantity}},
    )
    db.bin.update_one(
        {"_id": updated_mixture.bin_id, f"contents.{mix_id}": 0},
        {"$unset": {f"contents.{mix_id}": ""}},
    )

    refreshed = get_mixture(mix_id)
    return _mixture_response({"state": refreshed.to_dict(), "operations": []}, 200)


@mixture.route("/api/mixture/<mix_id>/split", methods=["POST"])
@no_cache
def mixture_split(mix_id):
    try:
        payload = mixture_split_schema(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    existing = get_mixture(mix_id)
    if existing is None:
        return problem.missing_mixture_response(mix_id)

    if Mixture.from_mongodb_doc(db.mixture.find_one({"_id": payload["new_mix_id"]})):
        return problem.duplicate_resource_response("new_mix_id")

    destination_bin = Bin.from_mongodb_doc(db.bin.find_one({"_id": payload["destination_bin"]}))
    if destination_bin is None:
        return problem.missing_bin_response(payload["destination_bin"])

    quantity = float(payload["quantity"])
    if quantity > existing.qty_total:
        error = MultipleInvalid(
            [Invalid("requested quantity exceeds mixture total", path=["quantity"])]
        )
        return problem.invalid_params_response(
            error, type="insufficient-quantity", status_code=405
        )

    remaining_components, extracted_components = _proportional_allocation(
        existing.components, quantity
    )

    existing.components = remaining_components
    existing.qty_total = sum(component["qty_remaining"] for component in remaining_components)

    split_event = build_audit_event(
        "split",
        payload["created_by"],
        details={
            "quantity": quantity,
            "new_mix_id": payload["new_mix_id"],
            "destination_bin": payload["destination_bin"],
            "components": extracted_components,
        },
        note=payload.get("note"),
    )

    db.mixture.update_one(
        {"_id": mix_id},
        {
            "$set": {
                "components": mixture_components_to_bson(existing.components),
                "qty_total": quantity_to_bson(existing.qty_total),
                "bin_id": existing.bin_id,
            },
            "$push": {"audit": split_event},
        },
    )

    new_mixture = Mixture(
        mix_id=payload["new_mix_id"],
        sku_id=existing.sku_id,
        bin_id=payload["destination_bin"],
        components=extracted_components,
        qty_total=float(quantity),
        created_by=payload["created_by"],
        audit=[
            build_audit_event(
                "created-from-split",
                payload["created_by"],
                details={
                    "source_mix_id": mix_id,
                    "components": extracted_components,
                    "quantity": quantity,
                },
                note=payload.get("note"),
            )
        ],
    )

    db.mixture.insert_one(new_mixture.to_mongodb_doc())

    db.bin.update_one(
        {"_id": existing.bin_id},
        {"$inc": {f"contents.{mix_id}": -quantity}},
    )
    db.bin.update_one(
        {"_id": existing.bin_id, f"contents.{mix_id}": 0},
        {"$unset": {f"contents.{mix_id}": ""}},
    )

    db.bin.update_one(
        {"_id": new_mixture.bin_id},
        {"$inc": {f"contents.{new_mixture.mix_id}": quantity}},
    )

    refreshed_new = get_mixture(new_mixture.mix_id)
    return _mixture_response({"state": refreshed_new.to_dict(), "operations": []}, 201)


@mixture.route("/api/mixture/<mix_id>/audit", methods=["POST"])
@no_cache
def mixture_append_audit(mix_id):
    payload = request.json or {}
    created_by = payload.get("created_by")
    event = payload.get("event")
    if not created_by or not event:
        error = MultipleInvalid(
            [
                Invalid("created_by and event are required", path=["audit"]),
            ]
        )
        return problem.invalid_params_response(error)

    existing = get_mixture(mix_id)
    if existing is None:
        return problem.missing_mixture_response(mix_id)

    audit_event = build_audit_event(
        event, created_by, details=payload.get("details"), note=payload.get("note")
    )
    db.mixture.update_one({"_id": mix_id}, {"$push": {"audit": audit_event}})

    refreshed = get_mixture(mix_id)
    return _mixture_response({"state": refreshed.to_dict(), "operations": []}, 200)
