import * as React from "react";
import {
  Link,
  Prompt,
  generatePath,
  useHistory,
  useParams,
} from "react-router-dom";
import { useFrontload } from "react-frontload";
import { useContext, useEffect, useState } from "react";

import { ApiContext, FrontloadContext } from "../api-client/api-client";
import {
  Problem,
  StepRequirement,
  StepTemplate as ApiStepTemplate,
} from "../api-client/data-models";
import { ToastContext } from "./Toast";
import WarnModal from "./WarnModal";
import { FourOhFour } from "./FourOhFour";
import {
  RequirementDraft,
  createRequirementDraft,
  ensureDraftRows,
  sanitizeRequirementDrafts,
} from "./step-template-utils";

import "../styles/StepTemplate.css";

function RequirementList({
  requirements,
  emptyLabel,
}: {
  requirements: StepRequirement[];
  emptyLabel: string;
}) {
  if (!requirements.length) {
    return <p className="step-template__io-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="step-template__io-list">
      {requirements.map((req, index) => (
        <li key={`${req.sku_id}-${index}`} className="step-template__io-item">
          <Link to={generatePath("/sku/:id", { id: req.sku_id })}>
            {req.sku_id}
          </Link>
          <span className="step-template__io-quantity">
            {req.quantity != null && req.quantity > 0
              ? `Qty: ${req.quantity}`
              : "Qty: flexible"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RequirementEditor({
  drafts,
  onChange,
  onAdd,
  onRemove,
}: {
  drafts: RequirementDraft[];
  onChange: (key: string, field: "sku_id" | "quantity", value: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="step-template__io-editor">
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
    </div>
  );
}

type SaveState = "live" | "unsaved" | "saving";

function StepTemplate({ editable = false }: { editable?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const api = useContext(ApiContext);
  const { setToastContent } = useContext(ToastContext);
  const [saveState, setSaveState] = useState<SaveState>("live");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data, frontloadMeta, setData } = useFrontload(
    "step-template-detail",
    async ({ api }: FrontloadContext) => ({
      template: await api.getStepTemplate(id),
    })
  );

  const templateData =
    (data as { template?: ApiStepTemplate | Problem } | undefined)?.template;

  const [unsavedName, setUnsavedName] = useState("");
  const [unsavedDescription, setUnsavedDescription] = useState("");
  const [unsavedMetadata, setUnsavedMetadata] = useState("");
  const [unsavedInputs, setUnsavedInputs] = useState<RequirementDraft[]>([
    createRequirementDraft(),
  ]);
  const [unsavedOutputs, setUnsavedOutputs] = useState<RequirementDraft[]>([
    createRequirementDraft(),
  ]);

  useEffect(() => {
    if (!editable) setSaveState("live");
  }, [editable]);

  useEffect(() => {
    if (!frontloadMeta.done) return;
    if (!templateData || templateData.kind !== "step-template") return;
    if (editable && saveState !== "live") return;

    setUnsavedName(templateData.state.name || "");
    setUnsavedDescription(templateData.state.description || "");
    setUnsavedMetadata(
      templateData.state.metadata
        ? JSON.stringify(templateData.state.metadata, null, 2)
        : ""
    );
    setUnsavedInputs(
      ensureDraftRows(
        templateData.state.inputs.map((req) => createRequirementDraft(req))
      )
    );
    setUnsavedOutputs(
      ensureDraftRows(
        templateData.state.outputs.map((req) => createRequirementDraft(req))
      )
    );
  }, [editable, frontloadMeta.done, saveState, templateData]);

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
    setSaveState("unsaved");
  };

  const handleDraftAdd = (
    setter: React.Dispatch<React.SetStateAction<RequirementDraft[]>>
  ) => {
    setter((prev) => [...prev, createRequirementDraft()]);
    setSaveState("unsaved");
  };

  const handleDraftRemove = (
    setter: React.Dispatch<React.SetStateAction<RequirementDraft[]>>,
    key: string
  ) => {
    setter((prev) => ensureDraftRows(prev.filter((draft) => draft.key !== key)));
    setSaveState("unsaved");
  };

  if (frontloadMeta.pending) {
    return <div>Loading...</div>;
  }

  if (frontloadMeta.error) {
    return <div>Connection error.</div>;
  }

  if (!templateData) {
    return <div>Template not found.</div>;
  }

  if ((templateData as Problem).kind === "problem") {
    const problem = templateData as Problem;
    if (problem.type === "missing-resource") {
      return <FourOhFour />;
    }
    return <h2>{problem.title}</h2>;
  }

  const template = templateData as ApiStepTemplate;

  const metadataPreview = template.state.metadata
    ? JSON.stringify(template.state.metadata, null, 2)
    : "";

  const handleSave = async () => {
    if (template.kind !== "step-template") return;

    const trimmedName = unsavedName.trim();
    const { requirements: inputRequirements, errors: inputErrors } =
      sanitizeRequirementDrafts(unsavedInputs);
    const { requirements: outputRequirements, errors: outputErrors } =
      sanitizeRequirementDrafts(unsavedOutputs);

    const errors: string[] = [];
    if (!trimmedName) {
      errors.push("Name is required.");
    }
    errors.push(...inputErrors.map((msg) => `Input ${msg}`));
    errors.push(...outputErrors.map((msg) => `Output ${msg}`));

    let metadataPayload: Record<string, unknown> | null | undefined = undefined;
    const metadataText = unsavedMetadata.trim();
    if (metadataText) {
      try {
        metadataPayload = JSON.parse(metadataText);
      } catch (err) {
        errors.push("Metadata must be valid JSON.");
      }
    } else {
      metadataPayload = null;
    }

    if (errors.length) {
      setToastContent({
        content: (
          <div>
            <p>Unable to save template:</p>
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

    setSaveState("saving");

    const resp = await api.hydrate(template).update({
      template_id: id,
      name: trimmedName,
      description: unsavedDescription.trim() || null,
      inputs: inputRequirements,
      outputs: outputRequirements,
      metadata: metadataPayload,
    });

    if (resp.kind === "problem") {
      setSaveState("unsaved");
      setToastContent({
        content: <p>{resp.title}</p>,
        mode: "failure",
      });
      return;
    }

    setSaveState("live");
    setToastContent({
      content: <p>{resp.status}</p>,
      mode: "success",
    });

    const updatedTemplate = await api.getStepTemplate(id);
    setData(() => ({ template: updatedTemplate }));
    history.push(generatePath("/step-template/:id", { id }));
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    const resp = await api.hydrate(template).delete();
    if (resp.kind === "status") {
      setToastContent({
        content: <p>{resp.status}</p>,
        mode: "success",
      });
      history.push("/step-templates");
    } else {
      setToastContent({
        content: <p>{resp.title}</p>,
        mode: "failure",
      });
    }
  };

  return (
    <section className="info-panel step-template">
      {editable && (
        <Prompt
          when={saveState !== "live"}
          message="Leave without saving changes?"
        />
      )}
      <WarnModal
        showModal={showDeleteModal}
        setShowModal={setShowDeleteModal}
        onContinue={handleDelete}
        dangerousActionName="Delete template"
      />
      <div className="info-item">
        <div className="info-item-title">Template ID</div>
        <div className="info-item-description">
          <span className="step-template__identifier">{template.state.template_id}</span>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Name</div>
        <div className="info-item-description">
          {editable ? (
            <input
              className="item-description-oneline"
              value={unsavedName}
              onChange={(e) => {
                setUnsavedName(e.target.value);
                setSaveState("unsaved");
              }}
            />
          ) : (
            <div className="item-description-oneline">
              {template.state.name || "(Unnamed template)"}
            </div>
          )}
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Description</div>
        <div className="info-item-description step-template__description">
          {editable ? (
            <textarea
              className="step-template__textarea"
              value={unsavedDescription}
              onChange={(e) => {
                setUnsavedDescription(e.target.value);
                setSaveState("unsaved");
              }}
              placeholder="Optional summary for operators"
            />
          ) : template.state.description ? (
            <p>{template.state.description}</p>
          ) : (
            <p className="step-template__empty">No description provided.</p>
          )}
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Inputs</div>
        <div className="info-item-description">
          {editable ? (
            <RequirementEditor
              drafts={unsavedInputs}
              onChange={(key, field, value) =>
                handleDraftChange(setUnsavedInputs, key, field, value)
              }
              onAdd={() => handleDraftAdd(setUnsavedInputs)}
              onRemove={(key) => handleDraftRemove(setUnsavedInputs, key)}
            />
          ) : (
            <RequirementList
              requirements={template.state.inputs}
              emptyLabel="No input SKUs configured."
            />
          )}
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Outputs</div>
        <div className="info-item-description">
          {editable ? (
            <RequirementEditor
              drafts={unsavedOutputs}
              onChange={(key, field, value) =>
                handleDraftChange(setUnsavedOutputs, key, field, value)
              }
              onAdd={() => handleDraftAdd(setUnsavedOutputs)}
              onRemove={(key) => handleDraftRemove(setUnsavedOutputs, key)}
            />
          ) : (
            <RequirementList
              requirements={template.state.outputs}
              emptyLabel="No output SKUs configured."
            />
          )}
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Metadata</div>
        <div className="info-item-description step-template__metadata">
          {editable ? (
            <textarea
              className="step-template__textarea"
              value={unsavedMetadata}
              onChange={(e) => {
                setUnsavedMetadata(e.target.value);
                setSaveState("unsaved");
              }}
              placeholder="Optional JSON metadata"
            />
          ) : metadataPreview ? (
            <pre className="step-template__metadata-pre">{metadataPreview}</pre>
          ) : (
            <p className="step-template__empty">No metadata recorded.</p>
          )}
        </div>
      </div>
      {editable ? (
        <div className="edit-controls">
          <button
            className="edit-controls-cancel-button"
            type="button"
            onClick={() =>
              history.push(generatePath("/step-template/:id", { id }))
            }
          >
            Cancel
          </button>
          <button
            className="edit-controls-save-button"
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <div className="info-item">
          <div className="info-item-title">Actions</div>
          <div className="info-item-description step-template__actions">
            <Link
              to={generatePath("/step-template/:id/edit", { id })}
              className="action-link"
            >
              Edit
            </Link>
            <button
              type="button"
              className="action-link step-template__delete-button"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default StepTemplate;
