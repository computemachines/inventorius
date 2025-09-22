from flask import Blueprint, request
from voluptuous import All, Required
from voluptuous.error import MultipleInvalid

from inventorius.data_models import StepTemplate
from inventorius.db import db
from inventorius.resource_models import StepTemplateEndpoint
from inventorius.util import no_cache
import inventorius.util_error_responses as problem
from inventorius.validation import (
    prefixed_id,
    step_template_create_schema,
    step_template_patch_schema,
)


step_template = Blueprint("step_template", __name__)


@step_template.route("/api/step-templates", methods=["POST"])
@no_cache
def step_templates_post():
    try:
        payload = step_template_create_schema(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    existing = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": payload["template_id"]})
    )
    if existing is not None:
        return problem.duplicate_resource_response("template_id")

    template = StepTemplate(
        template_id=payload["template_id"],
        name=payload.get("name"),
        description=payload.get("description"),
        inputs=payload.get("inputs", []),
        outputs=payload.get("outputs", []),
        metadata=payload.get("metadata"),
    )

    db.step_template.insert_one(template.to_mongodb_doc())
    return StepTemplateEndpoint.from_template(template).created_success_response()


@step_template.route("/api/step-template/<template_id>", methods=["GET"])
def step_template_get(template_id):
    template = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": template_id})
    )
    if template is None:
        return problem.missing_step_template_response(template_id)
    return StepTemplateEndpoint.from_template(template).get_response()


@step_template.route("/api/step-template/<template_id>", methods=["PATCH"])
@no_cache
def step_template_patch(template_id):
    try:
        payload = step_template_patch_schema.extend(
            {Required("template_id"): All(prefixed_id("TPL"), template_id)}
        )(request.json)
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    template = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": template_id})
    )
    if template is None:
        return problem.missing_step_template_response(template_id)

    sets = {}
    unsets = {}
    for field in ("name", "description", "inputs", "outputs", "metadata"):
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
        db.step_template.update_one({"_id": template_id}, updates)

    refreshed = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": template_id})
    )
    return StepTemplateEndpoint.from_template(refreshed).redirect_response(False)


@step_template.route("/api/step-template/<template_id>", methods=["DELETE"])
@no_cache
def step_template_delete(template_id):
    template = StepTemplate.from_mongodb_doc(
        db.step_template.find_one({"_id": template_id})
    )
    if template is None:
        return problem.missing_step_template_response(template_id)

    db.step_template.delete_one({"_id": template_id})
    return StepTemplateEndpoint.from_template(template).deleted_success_response()
