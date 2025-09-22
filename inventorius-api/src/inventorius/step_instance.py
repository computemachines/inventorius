from copy import deepcopy
from flask import Blueprint, Response, request
from voluptuous import All, Required
from voluptuous.error import Invalid, MultipleInvalid

from inventorius.data_models import (
    Batch,
    Bin,
    Mixture,
    StepInstance,
    StepTemplate,
    mixture_components_to_bson,
    quantity_to_bson,
)
from inventorius.db import db
from inventorius.mixture import apply_draw
from inventorius.resource_models import StepInstanceEndpoint
from inventorius.util import admin_increment_code, no_cache
import inventorius.util_error_responses as problem
from inventorius.validation import (
    prefixed_id,
    step_instance_create_schema,
    step_instance_patch_schema,
)


step_instance = Blueprint("step_instance", __name__)


def _operator_label(operator):
    if isinstance(operator, dict):
        for key in ("id", "name", "operator_id"):
            value = operator.get(key)
            if value:
                return str(value)
        return "operator"
    if operator is None:
        return "operator"
    return str(operator)


def _prepare_consumption_plan(
    instance_id,
    template_id,
    item,
    operator_label,
    bin_cache,
    batch_cache,
    mixture_cache,
):
    resource_id = item["resource_id"]
    quantity = float(item["quantity"])
    bin_id = item["bin_id"]

    bin_state = bin_cache.get(bin_id)
    if bin_state is None:
        bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": bin_id}))
        if bin_state is None:
            return problem.missing_bin_response(bin_id)
        bin_cache[bin_id] = bin_state
    available_in_bin = float(bin_state.contents.get(resource_id, 0))
    if available_in_bin < quantity:
        return problem.move_insufficient_quantity(
            name="quantity", availible=available_in_bin, requested=quantity
        )

    if resource_id.startswith("BAT"):
        batch_state = batch_cache.get(resource_id)
        if batch_state is None:
            batch_state = Batch.from_mongodb_doc(
                db.batch.find_one({"_id": resource_id})
            )
            if batch_state is None:
                return problem.missing_batch_response(resource_id)
            batch_cache[resource_id] = batch_state

        remaining = float(batch_state.qty_remaining or 0)
        if remaining < quantity:
            error = MultipleInvalid(
                [Invalid("requested quantity exceeds batch", path=["quantity"])]
            )
            return problem.invalid_params_response(
                error, type="insufficient-quantity", status_code=405
            )

        new_remaining = remaining - quantity
        batch_state.qty_remaining = new_remaining
        bin_state.contents[resource_id] = available_in_bin - quantity

        plan = {
            "type": "batch",
            "batch_id": resource_id,
            "bin_id": bin_id,
            "quantity": quantity,
            "new_qty_remaining": new_remaining,
        }
        record = {
            "resource_id": resource_id,
            "resource_type": "batch",
            "bin_id": bin_id,
            "quantity": quantity,
            "remaining_qty": new_remaining,
        }
        return plan, record

    if resource_id.startswith("MIX"):
        mixture_state = mixture_cache.get(resource_id)
        if mixture_state is None:
            mixture_state = Mixture.from_mongodb_doc(
                db.mixture.find_one({"_id": resource_id})
            )
            if mixture_state is None:
                return problem.missing_mixture_response(resource_id)
            mixture_cache[resource_id] = mixture_state

        if mixture_state.bin_id != bin_id:
            error = MultipleInvalid(
                [Invalid("mixture is not stored in the specified bin", path=["bin_id"])]
            )
            return problem.invalid_params_response(error)

        total_available = float(mixture_state.qty_total or 0)
        if total_available < quantity:
            error = MultipleInvalid(
                [Invalid("requested quantity exceeds mixture total", path=["quantity"])]
            )
            return problem.invalid_params_response(
                error, type="insufficient-quantity", status_code=405
            )

        # Work on a copy so repeated draws within the same request
        # operate on the updated state.
        mixture_snapshot = deepcopy(mixture_state)
        updated_mixture, event, extracted = apply_draw(
            mixture_snapshot,
            quantity,
            operator_label,
            note=f"step-instance {instance_id}",
        )
        event["event"] = "step-instance-consume"
        event.setdefault("details", {})["instance_id"] = instance_id
        event["details"]["template_id"] = template_id

        mixture_cache[resource_id] = updated_mixture
        bin_state.contents[resource_id] = available_in_bin - quantity

        plan = {
            "type": "mixture",
            "mixture": updated_mixture,
            "bin_id": bin_id,
            "quantity": quantity,
            "audit_event": event,
        }
        record = {
            "resource_id": resource_id,
            "resource_type": "mixture",
            "bin_id": bin_id,
            "quantity": quantity,
            "components": extracted,
            "remaining_qty": float(updated_mixture.qty_total or 0),
        }
        return plan, record

    error = MultipleInvalid(
        [Invalid("resource_id must reference a batch or mixture", path=["resource_id"])]
    )
    return problem.invalid_params_response(error)


def _prepare_production_plan(instance_id, item, bin_cache):
    batch_id = item["batch_id"]
    quantity = float(item["quantity"])
    bin_id = item.get("bin_id")

    existing = Batch.from_mongodb_doc(db.batch.find_one({"_id": batch_id}))
    if existing is not None:
        return problem.duplicate_resource_response("batch_id")

    bin_state = None
    if bin_id is not None:
        bin_state = bin_cache.get(bin_id)
        if bin_state is None:
            bin_state = Bin.from_mongodb_doc(db.bin.find_one({"_id": bin_id}))
            if bin_state is None:
                return problem.missing_bin_response(bin_id)
            bin_cache[bin_id] = bin_state

    batch_payload = {
        "id": batch_id,
        "sku_id": item["sku_id"],
        "owned_codes": item.get("owned_codes", []),
        "associated_codes": item.get("associated_codes", []),
        "qty_remaining": quantity,
        "produced_by_instance": instance_id,
        "codes": item.get("codes"),
    }
    if item.get("name") is not None:
        batch_payload["name"] = item.get("name")
    if item.get("props") is not None:
        batch_payload["props"] = item.get("props")

    batch_model = Batch.from_json(batch_payload)

    if bin_state is not None:
        current = float(bin_state.contents.get(batch_id, 0))
        bin_state.contents[batch_id] = current + quantity

    plan = {
        "batch": batch_model,
        "bin_id": bin_id,
        "quantity": quantity,
    }

    record = {
        "batch_id": batch_id,
        "sku_id": item["sku_id"],
        "quantity": quantity,
    }
    for key in (
        "name",
        "owned_codes",
        "associated_codes",
        "props",
        "bin_id",
        "codes",
        "notes",
    ):
        if item.get(key) is not None:
            record[key] = item.get(key)

    return plan, record


def _apply_consumption_plan(plan):
    if plan["type"] == "batch":
        db.batch.update_one(
            {"_id": plan["batch_id"]},
            {"$set": {"qty_remaining": quantity_to_bson(plan["new_qty_remaining"])}},
        )
        db.bin.update_one(
            {"_id": plan["bin_id"]},
            {"$inc": {f"contents.{plan['batch_id']}": -plan["quantity"]}},
        )
        db.bin.update_one(
            {"_id": plan["bin_id"], f"contents.{plan['batch_id']}": 0},
            {"$unset": {f"contents.{plan['batch_id']}": ""}},
        )
        return

    if plan["type"] == "mixture":
        mixture_state = plan["mixture"]
        db.mixture.update_one(
            {"_id": mixture_state.mix_id},
            {
                "$set": {
                    "components": mixture_components_to_bson(mixture_state.components),
                    "qty_total": quantity_to_bson(mixture_state.qty_total),
                },
                "$push": {"audit": plan["audit_event"]},
            },
        )
        db.bin.update_one(
            {"_id": plan["bin_id"]},
            {"$inc": {f"contents.{mixture_state.mix_id}": -plan["quantity"]}},
        )
        db.bin.update_one(
            {"_id": plan["bin_id"], f"contents.{mixture_state.mix_id}": 0},
            {"$unset": {f"contents.{mixture_state.mix_id}": ""}},
        )


def _apply_production_plan(plan):
    batch_model = plan["batch"]
    db.batch.insert_one(batch_model.to_mongodb_doc())
    admin_increment_code("BAT", batch_model.id)

    bin_id = plan.get("bin_id")
    if bin_id:
        db.bin.update_one(
            {"_id": bin_id},
            {"$inc": {f"contents.{batch_model.id}": plan["quantity"]}},
        )


@step_instance.route("/api/step-instances", methods=["POST"])
@no_cache
def step_instances_post():
    try:
        payload = step_instance_create_schema(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    existing = StepInstance.from_mongodb_doc(
        db.step_instance.find_one({"_id": payload["instance_id"]})
    )
    if existing is not None:
        return problem.duplicate_resource_response("instance_id")

    template = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": payload["template_id"]})
    )
    if template is None:
        return problem.missing_step_template_response(payload["template_id"])

    operator_label = _operator_label(payload.get("operator"))

    bin_cache = {}
    batch_cache = {}
    mixture_cache = {}

    consumption_plans = []
    consumed_records = []
    for item in payload["consumed"]:
        plan_or_response = _prepare_consumption_plan(
            payload["instance_id"],
            payload["template_id"],
            item,
            operator_label,
            bin_cache,
            batch_cache,
            mixture_cache,
        )
        if isinstance(plan_or_response, Response):
            return plan_or_response
        plan, record = plan_or_response
        consumption_plans.append(plan)
        consumed_records.append(record)

    production_plans = []
    produced_records = []
    for item in payload["produced"]:
        plan_or_response = _prepare_production_plan(
            payload["instance_id"], item, bin_cache
        )
        if isinstance(plan_or_response, Response):
            return plan_or_response
        plan, record = plan_or_response
        production_plans.append(plan)
        produced_records.append(record)

    for plan in consumption_plans:
        _apply_consumption_plan(plan)

    for plan in production_plans:
        _apply_production_plan(plan)

    instance = StepInstance(
        instance_id=payload["instance_id"],
        template_id=payload["template_id"],
        operator=payload.get("operator"),
        notes=payload.get("notes"),
        metadata=payload.get("metadata"),
        consumed=consumed_records,
        produced=produced_records,
    )

    db.step_instance.insert_one(instance.to_mongodb_doc())

    return StepInstanceEndpoint.from_instance(instance).created_success_response()


@step_instance.route("/api/step-instance/<instance_id>", methods=["GET"])
def step_instance_get(instance_id):
    instance = StepInstance.from_mongodb_doc(
        db.step_instance.find_one({"_id": instance_id})
    )
    if instance is None:
        return problem.missing_step_instance_response(instance_id)
    return StepInstanceEndpoint.from_instance(instance).get_response()


@step_instance.route("/api/step-instance/<instance_id>", methods=["PATCH"])
@no_cache
def step_instance_patch(instance_id):
    try:
        payload = step_instance_patch_schema.extend(
            {Required("instance_id"): All(prefixed_id("INS"), instance_id)}
        )(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    instance = StepInstance.from_mongodb_doc(
        db.step_instance.find_one({"_id": instance_id})
    )
    if instance is None:
        return problem.missing_step_instance_response(instance_id)

    sets = {}
    unsets = {}
    for field in ("operator", "notes", "metadata"):
        if field in payload:
            value = payload[field]
            if value is None:
                unsets[field] = ""
            else:
                sets[field] = value

    updates = {}
    if sets:
        updates["$set"] = sets
    if unsets:
        updates["$unset"] = unsets
    if updates:
        db.step_instance.update_one({"_id": instance_id}, updates)

    refreshed = StepInstance.from_mongodb_doc(
        db.step_instance.find_one({"_id": instance_id})
    )
    return StepInstanceEndpoint.from_instance(refreshed).redirect_response(False)


@step_instance.route("/api/step-instance/<instance_id>", methods=["DELETE"])
@no_cache
def step_instance_delete(instance_id):
    instance = StepInstance.from_mongodb_doc(
        db.step_instance.find_one({"_id": instance_id})
    )
    if instance is None:
        return problem.missing_step_instance_response(instance_id)

    db.step_instance.delete_one({"_id": instance_id})
    db.batch.update_many(
        {"produced_by_instance": instance_id},
        {"$unset": {"produced_by_instance": ""}},
    )

    return StepInstanceEndpoint.from_instance(instance).deleted_success_response()
