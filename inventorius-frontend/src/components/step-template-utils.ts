import { StepRequirement } from "../api-client/data-models";

let requirementDraftCounter = 0;

export interface RequirementDraft {
  key: string;
  sku_id: string;
  quantity: string;
}

export function createRequirementDraft(
  requirement?: StepRequirement
): RequirementDraft {
  return {
    key: `req-${Date.now()}-${requirementDraftCounter++}`,
    sku_id: requirement?.sku_id ?? "",
    quantity:
      requirement && requirement.quantity != null
        ? String(requirement.quantity)
        : "",
  };
}

export function sanitizeRequirementDrafts(
  drafts: RequirementDraft[]
): { requirements: StepRequirement[]; errors: string[] } {
  const errors: string[] = [];
  const requirements: StepRequirement[] = [];

  drafts.forEach((draft, index) => {
    const sku = draft.sku_id.trim();
    const quantityText = draft.quantity.trim();

    if (!sku && !quantityText) {
      return;
    }

    if (!sku) {
      errors.push(`Row ${index + 1}: SKU is required.`);
      return;
    }

    const requirement: StepRequirement = { sku_id: sku };

    if (quantityText) {
      const quantity = Number(quantityText);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(
          `Row ${index + 1}: Quantity must be a number greater than zero.`
        );
        return;
      }
      requirement.quantity = quantity;
    }

    requirements.push(requirement);
  });

  return { requirements, errors };
}

export function ensureDraftRows(
  drafts: RequirementDraft[]
): RequirementDraft[] {
  return drafts.length > 0 ? drafts : [createRequirementDraft()];
}
