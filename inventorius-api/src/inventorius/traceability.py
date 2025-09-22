from __future__ import annotations

from collections import deque
from typing import Dict, Iterable, Optional, Set

from flask import Blueprint, jsonify, request
from voluptuous.error import MultipleInvalid

from inventorius.data_models import Batch, StepInstance
from inventorius.db import db
from inventorius.util import no_cache
import inventorius.util_error_responses as problem
from inventorius.validation import traceability_request_schema


traceability = Blueprint("traceability", __name__)


class TraceabilityService:
    """Service for computing provenance bounds across the manufacturing DAG."""

    EPSILON = 1e-9

    def __init__(self, database):
        self._db = database
        self._batch_cache: Dict[str, Optional[Batch]] = {}
        self._step_cache: Dict[str, Optional[StepInstance]] = {}

        # step_id -> batch_id -> usage entry
        self._step_usage: Dict[str, Dict[str, Dict[str, object]]] = {}

        # queue of step_ids awaiting propagation upstream
        self._queue: deque[str] = deque()
        self._queued: Set[str] = set()

        # final aggregated results for source batches
        self._results: Dict[str, Dict[str, object]] = {}

    def get_batch(self, batch_id: str) -> Optional[Batch]:
        if batch_id not in self._batch_cache:
            doc = self._db.batch.find_one({"_id": batch_id})
            self._batch_cache[batch_id] = Batch.from_mongodb_doc(doc)
        return self._batch_cache[batch_id]

    def get_step(self, instance_id: str) -> Optional[StepInstance]:
        if instance_id not in self._step_cache:
            doc = self._db.step_instance.find_one({"_id": instance_id})
            self._step_cache[instance_id] = StepInstance.from_mongodb_doc(doc)
        return self._step_cache[instance_id]

    def seed_batch(self, batch_id: str, quantity: float, annotations: Optional[Iterable[str]] = None) -> None:
        if quantity <= 0:
            return
        self._record_batch_usage(batch_id, quantity, quantity, annotations)

    def run(self) -> None:
        while self._queue:
            step_id = self._queue.popleft()
            self._queued.discard(step_id)
            self._process_step(step_id)

    def results(self):
        formatted = []
        for batch_id in sorted(self._results.keys()):
            entry = self._results[batch_id]
            formatted.append(
                {
                    "batch_id": batch_id,
                    "lower_bound": entry["lower"],
                    "upper_bound": entry["upper"],
                    "annotations": sorted(entry["annotations"]),
                }
            )
        return formatted

    def _record_batch_usage(
        self,
        batch_id: str,
        lower: float,
        upper: float,
        annotations: Optional[Iterable[str]] = None,
    ) -> None:
        if upper <= 0:
            return
        if lower < 0:
            lower = 0.0
        if lower > upper:
            lower = upper

        annotations_set: Set[str] = set(annotations or ())

        batch = self.get_batch(batch_id)
        if batch is None:
            return

        if batch.produced_by_instance:
            step_id = batch.produced_by_instance
            usage_for_step = self._step_usage.setdefault(step_id, {})
            entry = usage_for_step.setdefault(
                batch_id,
                {"min": 0.0, "max": 0.0, "annotations": set()},
            )

            prev_min = entry["min"]
            prev_max = entry["max"]
            prev_ann = len(entry["annotations"])

            entry["min"] = float(entry["min"]) + float(lower)
            entry["max"] = float(entry["max"]) + float(upper)
            if entry["min"] > entry["max"]:
                entry["min"] = entry["max"]
            entry["annotations"].update(annotations_set)

            changed = (
                entry["min"] - prev_min > self.EPSILON
                or entry["max"] - prev_max > self.EPSILON
                or len(entry["annotations"]) != prev_ann
            )
            if changed and step_id not in self._queued:
                self._queue.append(step_id)
                self._queued.add(step_id)
            return

        # Source batch – aggregate into final results
        result_entry = self._results.setdefault(
            batch_id, {"lower": 0.0, "upper": 0.0, "annotations": set()}
        )
        result_entry["lower"] += float(lower)
        result_entry["upper"] += float(upper)
        result_entry["annotations"].update(annotations_set)

    def _process_step(self, step_id: str) -> None:
        step = self.get_step(step_id)
        if step is None:
            return

        produced_map: Dict[str, float] = {}
        for produced in step.produced or []:
            batch_id = produced.get("batch_id")
            if batch_id is None:
                continue
            quantity = float(produced.get("quantity") or 0.0)
            produced_map[batch_id] = quantity

        if not produced_map:
            return

        usage_for_step = self._step_usage.get(step_id, {})
        output_usages: Dict[str, Dict[str, object]] = {}
        base_annotations: Set[str] = set()

        for batch_id, produced_qty in produced_map.items():
            usage_entry = usage_for_step.get(batch_id)
            if usage_entry is None:
                min_usage = 0.0
                max_usage = 0.0
                annotations: Set[str] = set()
            else:
                min_usage = min(float(usage_entry["min"]), produced_qty)
                max_usage = min(float(usage_entry["max"]), produced_qty)
                if max_usage < min_usage:
                    min_usage = max_usage
                usage_entry["min"] = min_usage
                usage_entry["max"] = max_usage
                annotations = set(usage_entry.get("annotations", set()))
            output_usages[batch_id] = {
                "min": min_usage,
                "max": max_usage,
                "annotations": annotations,
            }
            base_annotations.update(annotations)

        query_capacity = sum(item["max"] for item in output_usages.values())
        complement_capacity = sum(
            produced_map[batch_id] - item["min"] for batch_id, item in output_usages.items()
        )

        if query_capacity <= 0:
            return

        consumed_items = step.consumed or []
        for consumed in consumed_items:
            resource_type = consumed.get("resource_type")
            if resource_type == "batch":
                resource_id = consumed.get("resource_id")
                total_in = float(consumed.get("quantity") or 0.0)
                lower = max(0.0, total_in - complement_capacity)
                upper = min(total_in, query_capacity)
                if upper <= 0:
                    continue
                annotations = set(base_annotations)
                if lower < upper and complement_capacity > 0:
                    annotations.add("complement-capacity")
                self._record_batch_usage(resource_id, lower, upper, annotations)
            elif resource_type == "mixture":
                components = consumed.get("components") or []
                for component in components:
                    resource_id = component.get("batch_id")
                    if resource_id is None:
                        continue
                    total_in = float(component.get("qty_initial") or 0.0)
                    lower = max(0.0, total_in - complement_capacity)
                    upper = min(total_in, query_capacity)
                    if upper <= 0:
                        continue
                    annotations = set(base_annotations)
                    if lower < upper and complement_capacity > 0:
                        annotations.add("complement-capacity")
                        annotations.add("mixture-allocation")
                    self._record_batch_usage(resource_id, lower, upper, annotations)


def _initial_quantity(service: TraceabilityService, batch: Batch) -> float:
    if batch.produced_by_instance:
        step = service.get_step(batch.produced_by_instance)
        if step is not None:
            for produced in step.produced or []:
                if produced.get("batch_id") == batch.id:
                    return float(produced.get("quantity") or 0.0)
    return float(batch.qty_remaining or 0.0)


@traceability.route("/api/traceability", methods=["POST"])
@no_cache
def traceability_post():
    try:
        payload = traceability_request_schema(request.json or {})
    except MultipleInvalid as e:
        return problem.invalid_params_response(e)

    batch_ids = payload.get("batch_ids", [])
    step_instance_ids = payload.get("step_instance_ids", [])

    service = TraceabilityService(db)

    for batch_id in batch_ids:
        batch = service.get_batch(batch_id)
        if batch is None:
            return problem.missing_batch_response(batch_id)
        quantity = _initial_quantity(service, batch)
        if quantity <= 0:
            continue
        service.seed_batch(batch_id, quantity)

    for instance_id in step_instance_ids:
        step = service.get_step(instance_id)
        if step is None:
            return problem.missing_step_instance_response(instance_id)
        for produced in step.produced or []:
            batch_id = produced.get("batch_id")
            quantity = float(produced.get("quantity") or 0.0)
            if batch_id and quantity > 0:
                service.seed_batch(batch_id, quantity)

    service.run()

    response_payload = {
        "query": {
            "batch_ids": batch_ids,
            "step_instance_ids": step_instance_ids,
        },
        "inputs": service.results(),
    }

    return jsonify(response_payload)
