import fetch from "cross-fetch";
import { json, response } from "express";
import { createContext } from "react";

import {
  Bin,
  RestOperation,
  CallableRestOperation,
  NextBin,
  Problem,
  Sku,
  SearchResults,
  NextSku,
  NextBatch,
  Batch,
  ApiStatus,
  Status,
  BatchCode,
  Mixture,
  MixtureCreateParams,
  MixtureDrawParams,
  MixtureSplitParams,
  MixtureAppendAuditParams,
  StepTemplate,
  StepTemplateCreateParams,
  StepTemplatePatchParams,
  StepInstance,
  StepInstanceCreateParams,
  StepInstancePatchParams,
  TraceabilityReport,
  TraceabilityQueryPayload,
} from "./data-models";

export interface FrontloadContext {
  api: ApiClient;
}

/**
 * Inventorius API client
 */
export class ApiClient {
  hostname: string;


  constructor(hostname = "") {
    this.hostname = hostname;
  }


  hydrate<
    T extends Sku | Batch | Mixture | StepTemplate | StepInstance
  >(server_rendered: T): T {
    if (Object.getPrototypeOf(server_rendered) !== Object.prototype)
      return server_rendered;
    switch (server_rendered.kind) {
    case "sku":
      Object.setPrototypeOf(server_rendered, Sku.prototype);
      break;
    case "batch":
      Object.setPrototypeOf(server_rendered, Batch.prototype);
      break;
    case "mixture":
      Object.setPrototypeOf(server_rendered, Mixture.prototype);
      break;
    case "step-template":
      Object.setPrototypeOf(server_rendered, StepTemplate.prototype);
      break;
    case "step-instance":
      Object.setPrototypeOf(server_rendered, StepInstance.prototype);
      break;
    default:
        let _exhaustive_check: never; // eslint-disable-line
    }
    if (server_rendered.operations) {
      for (const key in server_rendered.operations) {
        Object.setPrototypeOf(
          server_rendered.operations[key],
          CallableRestOperation.prototype
        );
        server_rendered.operations[key].hostname = this.hostname;
      }
    }
    return server_rendered;
  }


  async getStatus(): Promise<ApiStatus> {
    const resp = await fetch(`${this.hostname}/api/status`);
    if (!resp.ok) throw Error(`${this.hostname}/api/status returned error code`);
    return new ApiStatus({ ... await resp.json(), hostname: this.hostname });
  }


  async getNextBin(): Promise<NextBin> {
    const resp = await fetch(`${this.hostname}/api/next/bin`);
    const json = await resp.json();
    if (!resp.ok) throw Error(`${this.hostname}/api/next/bin returned error status`);
    return new NextBin({ ...json, hostname: this.hostname });
  }


  async getNextSku(): Promise<NextSku> {
    const resp = await fetch(`${this.hostname}/api/next/sku`);
    const json = await resp.json();
    if (!resp.ok) throw Error(`${this.hostname}/api/next/sku returned error status`);
    return new NextSku({ ...json, hostname: this.hostname });
  }


  async getNextBatch(): Promise<NextBatch> {
    const resp = await fetch(`${this.hostname}/api/next/batch`);
    const json = await resp.json();
    if (!resp.ok) throw Error(`${this.hostname}/api/next/sku returned error status`);
    return new NextBatch({ ...json, hostname: this.hostname });
  }


  async getSearchResults(params: {
    query: string;
    limit?: string;
    startingFrom?: string;
  }): Promise<SearchResults | Problem> {
    const resp = await fetch(
      `${this.hostname}/api/search?${new URLSearchParams(params).toString()}`
    );
    const json = await resp.json();

    if (resp.ok) return new SearchResults({ ...json });
    else return { ...json, kind: "problem" };
  }


  async getBin(id: string): Promise<Bin | Problem> {
    const resp = await fetch(`${this.hostname}/api/bin/${id}`);
    const json = await resp.json();

    if (resp.ok) return new Bin({ ...json, hostname: this.hostname });
    else return { ...json, kind: "problem" };
  }


  async createBin({ id, props }: { id: string; props?: unknown }): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/bins`, {
      method: "POST",
      body: JSON.stringify({ id, props }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (resp.ok) {
      return { ...json, kind: "status" };
    } else {
      return { ...json, kind: "problem" };
    }
  }


  async getSku(id: string): Promise<Sku | Problem> {
    const resp = await fetch(`${this.hostname}/api/sku/${id}`);
    const json = await resp.json();
    if (resp.ok) return new Sku({ ...json, hostname: this.hostname });
    else return { ...json, kind: "problem" };
  }


  async createSku(params: {
    id: string;
    name: string;
    props?: unknown;
    owned_codes?: string[];
    associated_codes?: string[];
  }): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/skus`, {
      method: "POST",
      body: JSON.stringify(params),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (resp.ok) {
      return { ...json, kind: "status" };
    } else {
      return { ...json, kind: "problem" };
    }
  }


  async getBatch(batch_id: string): Promise<Batch | Problem> {
    const resp = await fetch(`${this.hostname}/api/batch/${batch_id}`);
    const json = await resp.json();
    if (resp.ok) return new Batch({ ...json, hostname: this.hostname });
    else return { ...json, kind: "problem" };
  }


  async createBatch(params: {
    id: string;
    sku_id?: string;
    name?: string;
    owned_codes?: string[];
    associated_codes?: string[];
    props?: unknown;
    produced_by_instance?: string | null;
    qty_remaining?: number | null;
    codes?: BatchCode[];
  }): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/batches`, {
      method: "POST",
      body: JSON.stringify(params),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (resp.ok) {
      return { ...json, kind: "status" };
    } else {
      return { ...json, kind: "problem" };
    }
  }



  async createMixture(params: MixtureCreateParams): Promise<Mixture | Problem> {
    const resp = await fetch(`${this.hostname}/api/mixtures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) {
      return new Mixture({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async getMixture(mix_id: string): Promise<Mixture | Problem> {
    const resp = await fetch(`${this.hostname}/api/mixture/${mix_id}`);
    const json = await resp.json();
    if (resp.ok) {
      return new Mixture({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async drawMixture(
    mix_id: string,
    params: MixtureDrawParams
  ): Promise<Mixture | Problem> {
    const resp = await fetch(`${this.hostname}/api/mixture/${mix_id}/draw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) {
      return new Mixture({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async splitMixture(
    mix_id: string,
    params: MixtureSplitParams
  ): Promise<Mixture | Problem> {
    const resp = await fetch(`${this.hostname}/api/mixture/${mix_id}/split`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) {
      return new Mixture({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async appendMixtureAudit(
    mix_id: string,
    params: MixtureAppendAuditParams
  ): Promise<Mixture | Problem> {
    const resp = await fetch(`${this.hostname}/api/mixture/${mix_id}/audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) {
      return new Mixture({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async createStepTemplate(
    params: StepTemplateCreateParams
  ): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async getStepTemplate(template_id: string): Promise<StepTemplate | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-template/${template_id}`);
    const json = await resp.json();
    if (resp.ok) {
      return new StepTemplate({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async updateStepTemplate(
    template_id: string,
    patch: StepTemplatePatchParams
  ): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-template/${template_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async deleteStepTemplate(template_id: string): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-template/${template_id}`, {
      method: "DELETE",
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async listStepTemplates(): Promise<StepTemplate[] | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-templates`);
    const json = await resp.json();
    if (!resp.ok) return { ...json, kind: "problem" };
    const entries = Array.isArray(json)
      ? json
      : Array.isArray((json as any).templates)
        ? (json as any).templates
        : Array.isArray((json as any).items)
          ? (json as any).items
          : Array.isArray((json as any).results)
            ? (json as any).results
            : [];
    if (!Array.isArray(entries)) {
      return { ...json, kind: "problem" };
    }
    return entries.map((entry) =>
      new StepTemplate({
        ...entry,
        operations: Array.isArray((entry as any)?.operations)
          ? (entry as any).operations
          : [],
        hostname: this.hostname,
      })
    );
  }


  async createStepInstance(
    params: StepInstanceCreateParams
  ): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async getStepInstance(instance_id: string): Promise<StepInstance | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-instance/${instance_id}`);
    const json = await resp.json();
    if (resp.ok) {
      return new StepInstance({ ...json, hostname: this.hostname });
    }
    return { ...json, kind: "problem" };
  }


  async updateStepInstance(
    instance_id: string,
    patch: StepInstancePatchParams
  ): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-instance/${instance_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async deleteStepInstance(instance_id: string): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-instance/${instance_id}`, {
      method: "DELETE",
    });
    const json = await resp.json();
    if (resp.ok) return { ...json, kind: "status" };
    else return { ...json, kind: "problem" };
  }


  async listStepInstances(): Promise<StepInstance[] | Problem> {
    const resp = await fetch(`${this.hostname}/api/step-instances`);
    const json = await resp.json();
    if (!resp.ok) return { ...json, kind: "problem" };
    const entries = Array.isArray(json)
      ? json
      : Array.isArray((json as any).instances)
        ? (json as any).instances
        : Array.isArray((json as any).items)
          ? (json as any).items
          : Array.isArray((json as any).results)
            ? (json as any).results
            : [];
    if (!Array.isArray(entries)) {
      return { ...json, kind: "problem" };
    }
    return entries.map((entry) =>
      new StepInstance({
        ...entry,
        operations: Array.isArray((entry as any)?.operations)
          ? (entry as any).operations
          : [],
        hostname: this.hostname,
      })
    );
  }


  async postTraceability(
    payload: TraceabilityQueryPayload
  ): Promise<TraceabilityReport | Problem> {
    const resp = await fetch(`${this.hostname}/api/traceability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok) {
      return json as TraceabilityReport;
    }
    return { ...json, kind: "problem" };
  }




  async receive({
    into_id,
    item_id,
    quantity,
  }: {
    into_id: string;
    item_id: string;
    quantity: number;
  }): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/bin/${into_id}/contents`, {
      method: "POST",
      body: JSON.stringify({
        id: item_id,
        quantity,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (resp.ok) {
      return { ...json, kind: "status" };
    } else {
      return { ...json, kind: "problem" };
    }
  }

  async release({ from_id, item_id, quantity }): Promise<Status | Problem> {
    const resp = await fetch(`${this.hostname}/api/bin/${from_id}/contents`, {
      method: "POST",
      body: JSON.stringify({
        id: item_id,
        quantity: -quantity,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await resp.json();
    if (resp.ok) {
      return {...json, kind: "status"};
    } else {
      return {...json, kind: "problem"};
    }
  }

  async move({ from_id, to_id, item_id, quantity }): Promise < Status | Problem > {
    const resp = await fetch(`${this.hostname}/api/bin/${from_id}/contents/move`, {
      method: "PUT",
      body: JSON.stringify({
        id: item_id,
        destination: to_id,
        quantity,
      }),
      headers: {
        "Content-Type": "application/json",
      }
    });
    const json = await resp.json();
    if(resp.ok) {
      return { ...json, kind: "status" };
    } else {
      return { ...json, kind: "problem" };
    }
  }
}

// Do not use this on the server side! Use react-frontload.
export const ApiContext = createContext<ApiClient>(new ApiClient(""));
