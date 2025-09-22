Consider how to begin integrating these new concepts into this simple project.

# Inventory / Manufacturing Traceability Model — Seed Specification

## 1. Notation for Stories & Flows

We use a condensed notation to describe flows:

* **Batches**: `BAT1: 8u` → batch id + quantity of units.
* **SKUs**: capitalized symbols like `SKU_A`, act as batch *types*.
* **Mixtures**: `MxX{BAT1: 8, BAT2: 2}` means units of BAT1 & BAT2 of the same SKU were combined into a mixture, losing per-unit identity.
* **Step Templates**: `T1: Inputs [SKU_A, SKU_B] → Outputs [SKU_C]`.
* **Step Instances**: `I001(T1)` indicates a concrete run of template T1.
* **Draws**: `I001 draws 7u from MxX → makes F_A:7`.
* **Queries**: `F_A from BAT1 ∈ [min,max]`.

---

## 2. Goals & Requirements

* **Traceability**: Be able to answer “What input batches contributed to this output?” with either exact counts or bounded ranges.
* **Distinguishability invariant**: A batch’s units must remain distinguishable unless deliberately mixed.
* **Operator flexibility**: Real-world work sometimes demands relaxing constraints (mixing, unbatched inputs, breakage/loss). The system must allow it while documenting loss of certainty.
* **Manufacturing support**:

  * A *step template* specifies required input SKUs and output SKUs.
  * A *step instance* records actual consumed batches/mixtures and produced batches.
  * One step instance can produce multiple output batches.
* **No time travel**: A batch unit can only be produced once. Lineage forms a DAG (acyclic).
* **Recalls & compliance**: The system must generate reports of all possible downstream uses of a batch (ranges if uncertainty exists).

---

## 3. Core Datatypes

### SKU

* `sku_id`
* Attributes describing the category/type.

### Batch

* `batch_id`
* `sku_id` (points to SKU type)
* `produced_by_instance` (exactly one)
* `qty_remaining`
* `codes: [{code, metadata}]` for labels, supplier IDs, UPCs.

### Mixture

Represents loss of per-batch identity.

* `mix_id`
* `sku_id` (all components share SKU)
* `bin_id` (location of mixture)
* `components: {batch_id → qty_remaining}`
* `qty_total`
* `created_by` (operator, reason)
* `audit` (log of adds, draws, splits)

### Step Template

* `template_id`
* Inputs: list of `sku_id` (with quantity rules)
* Outputs: list of `sku_id`

### Step Instance

* `instance_id`
* `template_id` reference
* Operator, time, equipment, notes
* Consumed: list of `{batch_id|mix_id, qty}`
* Produced: list of new `batch_id, sku_id, qty`

---

## 4. Operator Behaviors

* **Receive units**: Create batches (from SKUs or anonymous).
* **Store in bins**: If multiple batches of the same SKU go into one bin without distinction → system creates a Mixture.
* **Consume in step**: Start a Step Instance, declare draws from batches or mixtures, and record new batches as outputs.
* **Move units**: Between bins, possibly splitting batches or mixtures.
* **Split mixtures**: Carve off part of a mixture to another bin (proportional or policy-driven).
* **Record exceptions**: Breakage, loss, or anonymous receipt allowed (but tracked as deliberate constraint weakening).

---

## 5. Constraint & Query Math

### Key rule

For any output batch (or set of outputs), input usage =

```
[lower bound, upper bound] per input batch
```

* **Lower bound**: `max(0, total_in_batch - capacity_of_complement_outputs)`
* **Upper bound**: `min(total_in_batch, qty_of_outputs_in_query)`

Where *complement outputs* = all other outputs from the same mixture/step.

### Properties

* Larger query sets → tighter bounds (less complement capacity).
* Single batch → exact if no mixture is in its path.
* Full set of outputs from a mixture → exact totals.

---

## 6. Example User Stories

### Story 1: Two SKUs in, one out (exact provenance)

```
Inputs: A1(10u of SKU_A), B1(10u of SKU_B)
Template T_Mix_1to1: 1A + 1B → 1C
Instance I001 consumes A1:10, B1:10
Produces C1:10 of SKU_C
```

**English**: Operator consumes 10 units of A1 and 10 of B1 to produce 10 of C1. Provenance is exact: C1 derives from A1 & B1 through I001.

---

### Story 2: One SKU in (mixed batches), one out (uncertain provenance)

```
Inputs: X1(8u of SKU_X), X2(2u of SKU_X)
Mix into BIN-X → MxX{X1:8, X2:2}
Instance I010 draws 7 → Y_A:7
                    draws 2 → Y_B:2
                    draws 1 → Y_C:1
```

**Queries**:

* Y\_A: X1 ∈ \[5,7], X2 ∈ \[0,2]
* Y\_B+Y\_A: X1 ∈ \[7,8], X2 ∈ \[1,2]
* Y\_C: X1 ∈ \[0,1], X2 ∈ \[0,1]
* All together: exactly X1=8, X2=2

**English**: Batches X1 and X2 were mixed, losing identity. Outputs Y\_A/B/C show bounded usage ranges depending on the query.

---

### Story 3: Two-step process, mixture consumed downstream

```
Mix Y_A:7, Y_B:2, Y_C:1 → MxY{Y_A:7, Y_B:2, Y_C:1}
Instance I011 draws 2 → Z1:2 of SKU_Z
```

**Query (Z1 provenance):**

* From X1 ∈ \[0,2]
* From X2 ∈ \[0,2]
  (because Z1 comes from 2 units of a 10-unit mixture of Y, itself traced back to mixed X1+X2)

**English**: The Y outputs are re-mixed, then consumed to make Z1. Provenance to original X1/X2 is possible but uncertain, bounded by \[0,2].