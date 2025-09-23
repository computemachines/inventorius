import * as React from "react";
import { useContext, useState } from "react";
import { Link, generatePath } from "react-router-dom";

import { ApiContext } from "../api-client/api-client";
import { ToastContext } from "./Toast";
import {
  RequirementDraft,
  createRequirementDraft,
  ensureDraftRows,
  sanitizeRequirementDrafts,
} from "./step-template-utils";

import "../styles/form.css";
import "../styles/StepTemplate.css";

function RequirementFormSection({
  title,
  drafts,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  drafts: RequirementDraft[];
  onChange: (key: string, field: "sku_id" | "quantity", value: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <fieldset className="step-template-form__fieldset">
      <legend>{title}</legend>
      <div className="step-template__io-rows">
        {drafts.map((draft) => (
          <div key={draft.key} className="step-template__io-row">
            <input
              type="text"
              value={draft.sku_id}
              onChange={(e) => onChange(draft.key, "sku_id", e.target.value)}
              placeholder="SKU ID"
            />
            <input
              type="number"
              min="0"
              step="any"
              value={draft.quantity}
              onChange={(e) => onChange(draft.key, "quantity", e.target.value)}
              placeholder="Quantity"
            />
            <button
              type="button"
              className="step-template__remove-row"
              onClick={() => onRemove(draft.key)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="step-template__add-button"
        onClick={onAdd}
      >
        Add row
      </button>
      <p className="step-template__io-helper">
        Provide SKU identifiers and optional nominal quantities. Leave quantity
        blank when the amount varies per execution.
      </p>
    </fieldset>
  );
}

function NewStepTemplate() {
  const api = useContext(ApiContext);
  const { setToastContent } = useContext(ToastContext);

  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metadata, setMetadata] = useState("");
  const [inputs, setInputs] = useState<RequirementDraft[]>([
    createRequirementDraft(),
  ]);
  const [outputs, setOutputs] = useState<RequirementDraft[]>([
    createRequirementDraft(),
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleDraftChange = (
    setter: React.Dispatch<React.SetStateAction<RequirementDraft[]>>,
    key: string,
    field: "sku_id" | "quantity",
    value: string
  ) => {
    setter((prev) =>
      prev.map((draft) =>
        draft.key === key ? { ...draft, [field]: value } : draft
      )
    );
  };

  const handleDraftAdd = (
    setter: React.Dispatch<React.SetStateAction<RequirementDraft[]>>
  ) => setter((prev) => [...prev, createRequirementDraft()]);

  const handleDraftRemove = (
    setter: React.Dispatch<React.SetStateAction<RequirementDraft[]>>,
    key: string
  ) => setter((prev) => ensureDraftRows(prev.filter((draft) => draft.key !== key)));

  return (
    <form
      className="form step-template-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting) return;

        const errors: string[] = [];
        const trimmedTemplateId = templateId.trim();
        const trimmedName = name.trim();

        if (!trimmedTemplateId) {
          errors.push("Template ID is required.");
        }
        if (!trimmedName) {
          errors.push("Name is required.");
        }

        const { requirements: inputRequirements, errors: inputErrors } =
          sanitizeRequirementDrafts(inputs);
        const { requirements: outputRequirements, errors: outputErrors } =
          sanitizeRequirementDrafts(outputs);
        errors.push(...inputErrors.map((msg) => `Input ${msg}`));
        errors.push(...outputErrors.map((msg) => `Output ${msg}`));

        let metadataPayload: Record<string, unknown> | undefined;
        const metadataText = metadata.trim();
        if (metadataText) {
          try {
            metadataPayload = JSON.parse(metadataText);
          } catch (err) {
            errors.push("Metadata must be valid JSON.");
          }
        }

        if (errors.length) {
          setToastContent({
            content: (
              <div>
                <p>Unable to create template:</p>
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ),
            mode: "failure",
          });
          return;
        }

        setSubmitting(true);
        const resp = await api.createStepTemplate({
          template_id: trimmedTemplateId,
          name: trimmedName,
          description: description.trim() || undefined,
          inputs: inputRequirements,
          outputs: outputRequirements,
          metadata: metadataPayload,
        });

        if (resp.kind === "problem") {
          setSubmitting(false);
          setToastContent({
            content: <p>{resp.title}</p>,
            mode: "failure",
          });
          return;
        }

        setToastContent({
          content: (
            <p>
              Template {" "}
              <Link to={generatePath("/step-template/:id", { id: trimmedTemplateId })}>
                {trimmedTemplateId}
              </Link>{" "}
              created.
            </p>
          ),
          mode: "success",
        });

        setTemplateId("");
        setName("");
        setDescription("");
        setMetadata("");
        setInputs([createRequirementDraft()]);
        setOutputs([createRequirementDraft()]);
        setSubmitting(false);
      }}
    >
      <h2 className="form-title">New Step Template</h2>
      <label htmlFor="template_id" className="form-label">
        Template ID
      </label>
      <input
        id="template_id"
        name="template_id"
        type="text"
        className="form-single-code-input"
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
      />
      <label htmlFor="template_name" className="form-label">
        Name
      </label>
      <input
        id="template_name"
        name="template_name"
        type="text"
        className="form-single-code-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor="template_description" className="form-label">
        Description
      </label>
      <textarea
        id="template_description"
        name="template_description"
        className="step-template__textarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional summary for operators"
      />
      <RequirementFormSection
        title="Inputs"
        drafts={inputs}
        onChange={(key, field, value) =>
          handleDraftChange(setInputs, key, field, value)
        }
        onAdd={() => handleDraftAdd(setInputs)}
        onRemove={(key) => handleDraftRemove(setInputs, key)}
      />
      <RequirementFormSection
        title="Outputs"
        drafts={outputs}
        onChange={(key, field, value) =>
          handleDraftChange(setOutputs, key, field, value)
        }
        onAdd={() => handleDraftAdd(setOutputs)}
        onRemove={(key) => handleDraftRemove(setOutputs, key)}
      />
      <label htmlFor="template_metadata" className="form-label">
        Metadata (JSON)
      </label>
      <textarea
        id="template_metadata"
        name="template_metadata"
        className="step-template__textarea"
        value={metadata}
        onChange={(e) => setMetadata(e.target.value)}
        placeholder="Optional JSON metadata"
      />
      <input
        type="submit"
        value={submitting ? "Saving..." : "Create template"}
        className="form-submit"
        disabled={submitting}
      />
    </form>
  );
}

export default NewStepTemplate;
