import fetch from "cross-fetch";

export type Props = Record<string, unknown> | null;
export type Unit = Unit1;
export class Unit1 {
  unit: string;
  value: number;
  constructor({ unit, value }: { unit: string; value: number }) {
    this.unit = unit;
    this.value = value;
  }
}

export class Currency extends Unit1 {}
export class USD extends Currency {
  unit: "USD";
  constructor(value: number) {
    super({ unit: "USD", value });
  }
}

async function status_or_problem(
  resp_promise: Promise<Response>
): Promise<Status | Problem> {
  const resp = await resp_promise;
  const json = await resp.json();
  if (resp.ok) {
    return { ...json, kind: "status" };
  } else {
    return { ...json, kind: "problem" };
  }
}

/**
 * JSON representation of a 'application/problem+json' response.
 */
export interface Problem {
  /**
   * Discriminator
   */
  kind: "problem";
  type: string;
  title: string;
  "invalid-params"?: Array<{ name: string; reason: string }>;
}

/**
 * Type returned by resource creation or update api calls when successful.
 * For example, POST /api/skus might return:
 *   {kind: "status", Id: "/sku/SKU000001", status: "sku successfully created"}
 */
export interface Status {
  /**
   * Discriminator
   */
  kind: "status";
  /**
   * URI of the newly created resource.
   */
  Id: string;
  /**
   * Human readable status string.
   */
  status: string;
}

class RestEndpoint {
  state: unknown;
  operations: Record<string, CallableRestOperation>;
  constructor({
    state,
    operations,
    hostname,
  }: {
    state: unknown;
    operations: RestOperation[];
    hostname: string;
  }) {
    this.state = state;
    this.operations = {};
    for (const op of operations) {
      this.operations[op.rel] = new CallableRestOperation({ hostname, ...op });
    }
  }
}

export interface RestOperation {
  rel: string;
  href: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export class CallableRestOperation implements RestOperation {
  rel: string;
  href: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  hostname: string;
  constructor(config: {
    rel: string;
    href: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    hostname: string;
  }) {
    Object.assign(this, config);
  }

  perform({
    body,
    json,
  }: {
    body?: string;
    json?: unknown;
  } = {}): Promise<Response> {
    if (body) {
      return fetch(`${this.hostname}${this.href}`, {
        method: this.method,
        body,
      });
    } else if (json) {
      return fetch(`${this.hostname}${this.href}`, {
        method: this.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      });
    } else {
      return fetch(`${this.hostname}${this.href}`, {
        method: this.method,
      });
    }
  }
}

export class ApiStatus extends RestEndpoint {
  kind: "api-status" = "api-status";
  state: {
    version: string;
    "is-ok": boolean;
  };
}

export interface BinState {
  id: string;
  contents: Record<string, number>;
  props?: Props;
}
export class Bin extends RestEndpoint {
  kind: "bin" = "bin";
  state: BinState;
  operations: {
    delete: CallableRestOperation;
    update: CallableRestOperation;
  };

  update(patch: { props: Props }): Promise<Status | Problem> {
    return status_or_problem(this.operations.update.perform({ json: patch }));
  }

  delete(): Promise<Status | Problem> {
    return status_or_problem(this.operations.delete.perform());
  }
}

type BinId = string;
type SkuId = string;
type BatchId = string;
export interface SkuLocations {
  kind: "sku-locations";
  state: Record<BinId, Record<SkuId, number>>;
}
interface SkuBatches {
  kind: "sku-batches";
  state: BatchId[];
}
export interface BatchLocations {
  kind: "batch-locations";
  state: Record<BinId, Record<BatchId, number>>;
}

export interface BatchCode {
  code: string;
  metadata?: Record<string, unknown>;
}

export interface SkuState {
  id: string;
  owned_codes: string[];
  associated_codes: string[];
  name?: string;
  props?: Props;
}
export class Sku extends RestEndpoint {
  kind: "sku" = "sku";
  state: SkuState;
  operations: {
    update: CallableRestOperation;
    delete: CallableRestOperation;
    bins: CallableRestOperation;
    batches: CallableRestOperation;
  };
  update(patch: {
    name?: string;
    owned_codes?: string[];
    associated_codes?: string[];
    props?: Props;
  }): Promise<Status | Problem> {
    return status_or_problem(this.operations.update.perform({ json: patch }));
  }
  delete(): Promise<Status | Problem> {
    return status_or_problem(this.operations.delete.perform());
  }
  async bins(): Promise<SkuLocations | Problem> {
    const resp = await this.operations.bins.perform();
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "sku-locations" };
    else return { ...json, kind: "problem" };
  }
  async batches(): Promise<SkuBatches | Problem> {
    const resp = await this.operations.batches.perform();
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "sku-batches" };
    else return { ...json, kind: "problem" };
  }
}

export interface BatchState {
  id: string;
  sku_id?: string;
  name?: string;
  owned_codes?: string[];
  associated_codes?: string[];
  props?: Props;
  produced_by_instance?: string | null;
  qty_remaining?: number | null;
  codes?: BatchCode[];
}
export class Batch extends RestEndpoint {
  kind: "batch" = "batch";
  state: BatchState;
  operations: {
    update: CallableRestOperation;
    delete: CallableRestOperation;
    bins: CallableRestOperation;
  };
  update(patch: {
    id: string;
    sku_id?: string;
    name?: string;
    owned_codes?: string[];
    associated_codes?: string[];
    props?: Props;
    produced_by_instance?: string | null;
    qty_remaining?: number | null;
    codes?: BatchCode[] | null;
  }): Promise<Status | Problem> {
    return status_or_problem(this.operations.update.perform({ json: patch }));
  }
  delete(): Promise<Status | Problem> {
    return status_or_problem(this.operations.delete.perform());
  }
  async bins(): Promise<BatchLocations | Problem> {
    const resp = await this.operations.bins.perform();
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "batch-locations" };
    else return { ...json, kind: "problem" };
  }
}

export interface MixtureComponent {
  batch_id: string;
  qty_initial: number;
  qty_remaining: number;
}

export interface MixtureAuditEvent {
  event: string;
  created_by: string;
  timestamp: string;
  details?: Record<string, unknown>;
  note?: string;
}

export interface MixtureState {
  mix_id: string;
  sku_id: string;
  bin_id: string;
  components: MixtureComponent[];
  qty_total: number;
  created_by?: string;
  audit: MixtureAuditEvent[];
}

export interface MixtureComponentQuantity {
  batch_id: string;
  quantity: number;
  [key: string]: unknown;
}

export interface MixtureCreateParams {
  mix_id: string;
  sku_id: string;
  bin_id: string;
  components: MixtureComponentQuantity[];
  created_by: string;
  audit?: MixtureAuditEvent[];
}

export interface MixtureDrawParams {
  quantity: number;
  created_by: string;
  note?: string;
}

export interface MixtureSplitParams {
  quantity: number;
  destination_bin: string;
  new_mix_id: string;
  created_by: string;
  note?: string;
}

export interface MixtureAppendAuditParams {
  created_by: string;
  event: string;
  details?: Record<string, unknown>;
  note?: string;
}

export class Mixture extends RestEndpoint {
  kind: "mixture" = "mixture";
  state: MixtureState;
  operations: {
    draw: CallableRestOperation;
    split: CallableRestOperation;
    "append-audit": CallableRestOperation;
  };

  private instantiate(json: unknown): Mixture {
    const payload = json as {
      state: MixtureState;
      operations: RestOperation[];
    };
    return new Mixture({
      state: payload.state,
      operations: payload.operations || [],
      hostname: this.operations.draw.hostname,
    });
  }

  async draw(params: MixtureDrawParams): Promise<Mixture | Problem> {
    const resp = await this.operations.draw.perform({ json: params });
    const json = await resp.json();
    if (resp.ok) {
      return this.instantiate(json);
    }
    return { ...json, kind: "problem" };
  }

  async split(params: MixtureSplitParams): Promise<Mixture | Problem> {
    const resp = await this.operations.split.perform({ json: params });
    const json = await resp.json();
    if (resp.ok) {
      return this.instantiate(json);
    }
    return { ...json, kind: "problem" };
  }

  async appendAudit(params: MixtureAppendAuditParams): Promise<Mixture | Problem> {
    const resp = await this.operations["append-audit"].perform({ json: params });
    const json = await resp.json();
    if (resp.ok) {
      return this.instantiate(json);
    }
    return { ...json, kind: "problem" };
  }
}

export interface StepRequirement {
  sku_id: string;
  quantity?: number | null;
  [key: string]: unknown;
}

export interface StepTemplateState {
  template_id: string;
  name?: string;
  description?: string;
  inputs: StepRequirement[];
  outputs: StepRequirement[];
  metadata?: Record<string, unknown>;
}

export interface StepTemplateCreateParams {
  template_id: string;
  name: string;
  description?: string;
  inputs: StepRequirement[];
  outputs: StepRequirement[];
  metadata?: Record<string, unknown>;
}

export interface StepTemplatePatchParams {
  template_id: string;
  name?: string | null;
  description?: string | null;
  inputs?: StepRequirement[] | null;
  outputs?: StepRequirement[] | null;
  metadata?: Record<string, unknown> | null;
}

export class StepTemplate extends RestEndpoint {
  kind: "step-template" = "step-template";
  state: StepTemplateState;
  operations: {
    update: CallableRestOperation;
    delete: CallableRestOperation;
    create: CallableRestOperation;
  };

  update(patch: StepTemplatePatchParams): Promise<Status | Problem> {
    return status_or_problem(this.operations.update.perform({ json: patch }));
  }

  delete(): Promise<Status | Problem> {
    return status_or_problem(this.operations.delete.perform());
  }

  createStepInstance(params: StepInstanceCreateParams): Promise<Status | Problem> {
    return status_or_problem(this.operations.create.perform({ json: params }));
  }
}

export interface StepInstanceConsumedComponent {
  batch_id: string;
  qty_initial: number;
  qty_remaining: number;
}

export interface StepInstanceConsumedResource {
  resource_id: string;
  resource_type: "batch" | "mixture";
  bin_id: string;
  quantity: number;
  remaining_qty?: number;
  components?: StepInstanceConsumedComponent[];
  [key: string]: unknown;
}

export interface StepInstanceProducedBatch {
  batch_id: string;
  sku_id: string;
  quantity: number;
  name?: string;
  owned_codes?: string[];
  associated_codes?: string[];
  props?: Props;
  bin_id?: string;
  codes?: BatchCode[];
  notes?: string;
  [key: string]: unknown;
}

export interface StepInstanceState {
  instance_id: string;
  template_id: string;
  operator: string | Record<string, unknown>;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  consumed: StepInstanceConsumedResource[];
  produced: StepInstanceProducedBatch[];
}

export interface StepInstanceCreateParams {
  instance_id: string;
  template_id: string;
  operator: string | Record<string, unknown>;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  consumed: StepInstanceConsumedResource[];
  produced: StepInstanceProducedBatch[];
}

export interface StepInstancePatchParams {
  instance_id: string;
  operator?: string | Record<string, unknown> | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class StepInstance extends RestEndpoint {
  kind: "step-instance" = "step-instance";
  state: StepInstanceState;
  operations: {
    update: CallableRestOperation;
    delete: CallableRestOperation;
  };

  update(patch: StepInstancePatchParams): Promise<Status | Problem> {
    return status_or_problem(this.operations.update.perform({ json: patch }));
  }

  delete(): Promise<Status | Problem> {
    return status_or_problem(this.operations.delete.perform());
  }
}

export interface TraceabilityQueryPayload {
  batch_ids?: string[];
  step_instance_ids?: string[];
}

export interface TraceabilityQuerySummary {
  batch_ids: string[];
  step_instance_ids: string[];
}

export interface TraceabilityInputBounds {
  batch_id: string;
  lower_bound: number;
  upper_bound: number;
  annotations: string[];
}

export interface TraceabilityReport {
  query: TraceabilityQuerySummary;
  inputs: TraceabilityInputBounds[];
}

export class NextBin extends RestEndpoint {
  kind: "next-bin" = "next-bin";
  state: string;
  operations: {
    create: CallableRestOperation;
  };

  create(): Promise<Response> {
    return this.operations.create.perform({ json: { id: this.state } });
  }
}

export class NextSku extends RestEndpoint {
  kind: "next-sku" = "next-sku";
  state: string;
  operations: {
    create: CallableRestOperation;
  };

  create(): Promise<Response> {
    return this.operations.create.perform({ json: { id: this.state } });
  }
}

export class NextBatch extends RestEndpoint {
  kind: "next-batch" = "next-batch";
  state: string;
  operations: {
    create: CallableRestOperation;
  };

  create(): Promise<Response> {
    return this.operations.create.perform({ json: { id: this.state } });
  }
}

export interface MixtureSearchResult {
  id: string;
  mix_id?: string;
  sku_id?: string;
  bin_id?: string;
  qty_total?: number;
  name?: string;
  [key: string]: unknown;
}

export type SearchResult =
  | SkuState
  | BatchState
  | BinState
  | MixtureSearchResult;
export class SearchResults extends RestEndpoint {
  kind: "search-results" = "search-results";
  state: {
    total_num_results: number;
    starting_from: number;
    limit: number;
    returned_num_results: number;
    results: SearchResult[];
  };
  operations: null;
}
export function isSkuState(result: SearchResult): result is SkuState {
  return result.id.startsWith("SKU");
}
export function isBinState(result: SearchResult): result is BinState {
  return result.id.startsWith("BIN");
}
export function isBatchState(result: SearchResult): result is BatchState {
  return result.id.startsWith("BAT");
}
export function isMixtureState(
  result: SearchResult
): result is MixtureSearchResult {
  return result.id.startsWith("MIX");
}

// type Sku = {
//   id: string;
//   ownedCodes?: Array<string>;
//   associatedCodes?: Array<string>;
//   name?: string;
//   props?: Props;
// };

// export function Sku(json: Sku): void {
//   this.id = json.id;
//   this.ownedCodes = json.ownedCodes || [];
//   this.associatedCodes = json.associatedCodes || [];
//   this.name = json.name;
//   this.props = json.props;
// }
// Sku.prototype.toJson = null;

// type Batch = {
//   id: string;
//   skuId?: string;
//   ownedCodes?: Array<string>;
//   associatedCodes?: Array<string>;
//   name?: string;
//   props?: Props;
// };

// export function Batch(json: Batch): void {
//   this.id = json.id;
//   this.skuId = json.skuId;
//   this.ownedCodes = json.ownedCodes || [];
//   this.associatedCodes = json.associatedCodes || [];
//   this.name = json.name;
//   this.props = json.props;
// }
// Batch.prototype.toJson = null;
