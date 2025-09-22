import * as React from "react";
import { useContext, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useFrontload } from "react-frontload";
import * as Sentry from "@sentry/react";

import { ApiClient, ApiContext, FrontloadContext } from "../api-client/api-client";
import {
  Mixture as ApiMixture,
  MixtureAppendAuditParams,
  MixtureDrawParams,
  MixtureSplitParams,
  Problem,
} from "../api-client/data-models";
import { FourOhFour } from "./FourOhFour";
import DataTable, { HeaderSpec } from "./DataTable";
import ItemLabel from "./ItemLabel";
import WarnModal from "./WarnModal";
import { ToastContext } from "./Toast";

import "../styles/Mixture.css";

function useHydratedMixture(
  mixture: ApiMixture | Problem | undefined,
  api: ApiClient
) {
  return useMemo(() => {
    if (mixture && mixture.kind === "mixture") {
      return api.hydrate(mixture);
    }
    return mixture;
  }, [mixture, api]);
}

function Mixture(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const api = useContext(ApiContext);
  const { setToastContent } = useContext(ToastContext);

  const { data, frontloadMeta, setData } = useFrontload(
    "mixture-component",
    async ({ api }: FrontloadContext) => {
      const mixture = await api.getMixture(id);
      if (mixture.kind === "mixture") {
        return { mixture: api.hydrate(mixture) };
      }
      return { mixture };
    }
  );

  const hydratedMixture = useHydratedMixture(data?.mixture, api);

  const [drawForm, setDrawForm] = useState({
    quantity: "",
    createdBy: "",
    note: "",
  });
  const [splitForm, setSplitForm] = useState({
    quantity: "",
    destinationBin: "",
    newMixId: "",
    createdBy: "",
    note: "",
  });
  const [auditForm, setAuditForm] = useState({
    event: "",
    createdBy: "",
    note: "",
    details: "",
  });

  const [pendingDraw, setPendingDraw] = useState<MixtureDrawParams | null>(
    null
  );
  const [pendingSplit, setPendingSplit] = useState<MixtureSplitParams | null>(
    null
  );

  const [isSubmittingDraw, setIsSubmittingDraw] = useState(false);
  const [isSubmittingSplit, setIsSubmittingSplit] = useState(false);
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

  const [showDrawModal, setShowDrawModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  const performMixtureUpdate = async (
    updater: (mixture: ApiMixture) => Promise<ApiMixture | Problem>
  ) => {
    if (!hydratedMixture || hydratedMixture.kind !== "mixture") return null;

    const resp = await updater(hydratedMixture);
    if (resp.kind === "mixture") {
      const nextState = api.hydrate(resp);
      setData(() => ({ mixture: nextState }));
      return nextState;
    }
    setToastContent({
      content: <div>{resp.title}</div>,
      mode: "failure",
    });
    return null;
  };

  if (frontloadMeta.pending) {
    return <div>Loading...</div>;
  }

  if (frontloadMeta.error) {
    Sentry.captureException(new Error("Mixture API error"));
    return <div>Connection Error</div>;
  }

  if (!data || data.mixture.kind === "problem") {
    if (data?.mixture.type === "missing-resource") {
      return <FourOhFour />;
    }
    return <h2>{data?.mixture.title || "Unable to load mixture"}</h2>;
  }

  const mixture = data.mixture;

  const componentRows = mixture.state.components.map((component) => ({
    Batch: component.batch_id,
    "Initial Quantity": component.qty_initial,
    "Remaining Quantity": component.qty_remaining,
  }));

  const auditRows = mixture.state.audit
    .slice()
    .sort((a, b) =>
      a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0
    );

  return (
    <div className="mixture">
      <div className="info-panel mixture__details">
        <div className="info-item">
          <div className="info-item-title">Mixture Label</div>
          <div className="info-item-description">
            <ItemLabel link={false} label={mixture.state.mix_id} />
          </div>
        </div>
        <div className="info-item">
          <div className="info-item-title">SKU</div>
          <div className="info-item-description">
            <ItemLabel label={mixture.state.sku_id} />
          </div>
        </div>
        <div className="info-item">
          <div className="info-item-title">Bin</div>
          <div className="info-item-description">
            <ItemLabel label={mixture.state.bin_id} />
          </div>
        </div>
        <div className="info-item">
          <div className="info-item-title">Quantity</div>
          <div className="info-item-description">
            <span>{mixture.state.qty_total}</span>
          </div>
        </div>
      </div>

      <section className="mixture__section">
        <h3 className="mixture__section-title">Components</h3>
        <DataTable
          headers={["Batch", "Initial Quantity", "Remaining Quantity"]}
          data={componentRows}
          headerSpecs={{
            Batch: new HeaderSpec(".ItemLabel"),
            "Initial Quantity": new HeaderSpec(),
            "Remaining Quantity": new HeaderSpec(),
          }}
        />
      </section>

      <section className="mixture__section">
        <h3 className="mixture__section-title">Actions</h3>
        <div className="mixture-actions">
          <div className="mixture-action">
            <h4>Draw from Mixture</h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!drawForm.quantity || !drawForm.createdBy) {
                  setToastContent({
                    content: <div>Quantity and operator are required.</div>,
                    mode: "failure",
                  });
                  return;
                }
                const quantity = Number(drawForm.quantity);
                if (!Number.isFinite(quantity) || quantity <= 0) {
                  setToastContent({
                    content: <div>Enter a quantity greater than zero.</div>,
                    mode: "failure",
                  });
                  return;
                }
                setPendingDraw({
                  quantity,
                  created_by: drawForm.createdBy,
                  note: drawForm.note.trim() ? drawForm.note : undefined,
                });
                setShowDrawModal(true);
              }}
            >
              <label className="mixture-action__label" htmlFor="draw-quantity">
                Quantity
              </label>
              <input
                id="draw-quantity"
                type="number"
                min="0"
                value={drawForm.quantity}
                onChange={(e) =>
                  setDrawForm({ ...drawForm, quantity: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="draw-created-by">
                Operator
              </label>
              <input
                id="draw-created-by"
                value={drawForm.createdBy}
                onChange={(e) =>
                  setDrawForm({ ...drawForm, createdBy: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="draw-note">
                Note (optional)
              </label>
              <textarea
                id="draw-note"
                value={drawForm.note}
                onChange={(e) =>
                  setDrawForm({ ...drawForm, note: e.target.value })
                }
              />
              <button type="submit" disabled={isSubmittingDraw}>
                Draw
              </button>
            </form>
          </div>

          <div className="mixture-action">
            <h4>Split Mixture</h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !splitForm.quantity ||
                  !splitForm.destinationBin ||
                  !splitForm.newMixId ||
                  !splitForm.createdBy
                ) {
                  setToastContent({
                    content: <div>All fields except note are required.</div>,
                    mode: "failure",
                  });
                  return;
                }
                const quantity = Number(splitForm.quantity);
                if (!Number.isFinite(quantity) || quantity <= 0) {
                  setToastContent({
                    content: <div>Enter a quantity greater than zero.</div>,
                    mode: "failure",
                  });
                  return;
                }
                setPendingSplit({
                  quantity,
                  destination_bin: splitForm.destinationBin,
                  new_mix_id: splitForm.newMixId,
                  created_by: splitForm.createdBy,
                  note: splitForm.note.trim() ? splitForm.note : undefined,
                });
                setShowSplitModal(true);
              }}
            >
              <label className="mixture-action__label" htmlFor="split-quantity">
                Quantity
              </label>
              <input
                id="split-quantity"
                type="number"
                min="0"
                value={splitForm.quantity}
                onChange={(e) =>
                  setSplitForm({ ...splitForm, quantity: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="split-destination">
                Destination Bin
              </label>
              <input
                id="split-destination"
                value={splitForm.destinationBin}
                onChange={(e) =>
                  setSplitForm({
                    ...splitForm,
                    destinationBin: e.target.value,
                  })
                }
              />
              <label className="mixture-action__label" htmlFor="split-new-mix">
                New Mixture ID
              </label>
              <input
                id="split-new-mix"
                value={splitForm.newMixId}
                onChange={(e) =>
                  setSplitForm({ ...splitForm, newMixId: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="split-created-by">
                Operator
              </label>
              <input
                id="split-created-by"
                value={splitForm.createdBy}
                onChange={(e) =>
                  setSplitForm({ ...splitForm, createdBy: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="split-note">
                Note (optional)
              </label>
              <textarea
                id="split-note"
                value={splitForm.note}
                onChange={(e) =>
                  setSplitForm({ ...splitForm, note: e.target.value })
                }
              />
              <button type="submit" disabled={isSubmittingSplit}>
                Split
              </button>
            </form>
          </div>

          <div className="mixture-action">
            <h4>Add Audit Entry</h4>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!auditForm.event || !auditForm.createdBy) {
                  setToastContent({
                    content: <div>Event and operator are required.</div>,
                    mode: "failure",
                  });
                  return;
                }

                let parsedDetails: Record<string, unknown> | undefined;
                if (auditForm.details.trim()) {
                  try {
                    parsedDetails = JSON.parse(auditForm.details);
                  } catch (error) {
                    setToastContent({
                      content: <div>Details must be valid JSON.</div>,
                      mode: "failure",
                    });
                    return;
                  }
                }

                setIsSubmittingAudit(true);
                const params: MixtureAppendAuditParams = {
                  event: auditForm.event,
                  created_by: auditForm.createdBy,
                  note: auditForm.note.trim() ? auditForm.note : undefined,
                  details: parsedDetails,
                };
                const updated = await performMixtureUpdate((mixture) =>
                  mixture.appendAudit(params)
                );
                setIsSubmittingAudit(false);

                if (updated) {
                  setAuditForm({
                    event: "",
                    createdBy: "",
                    note: "",
                    details: "",
                  });
                  setToastContent({
                    content: <div>Audit entry recorded.</div>,
                    mode: "success",
                  });
                }
              }}
            >
              <label className="mixture-action__label" htmlFor="audit-event">
                Event
              </label>
              <input
                id="audit-event"
                value={auditForm.event}
                onChange={(e) =>
                  setAuditForm({ ...auditForm, event: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="audit-created-by">
                Operator
              </label>
              <input
                id="audit-created-by"
                value={auditForm.createdBy}
                onChange={(e) =>
                  setAuditForm({ ...auditForm, createdBy: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="audit-note">
                Note (optional)
              </label>
              <textarea
                id="audit-note"
                value={auditForm.note}
                onChange={(e) =>
                  setAuditForm({ ...auditForm, note: e.target.value })
                }
              />
              <label className="mixture-action__label" htmlFor="audit-details">
                Details JSON (optional)
              </label>
              <textarea
                id="audit-details"
                value={auditForm.details}
                onChange={(e) =>
                  setAuditForm({ ...auditForm, details: e.target.value })
                }
                placeholder="{ &quot;key&quot;: &quot;value&quot; }"
              />
              <button type="submit" disabled={isSubmittingAudit}>
                Append Audit
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mixture__section">
        <h3 className="mixture__section-title">Audit Log</h3>
        <table className="mixture-audit">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Event</th>
              <th scope="col">Operator</th>
              <th scope="col">Note</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {auditRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="mixture-audit__empty">
                  No audit entries recorded yet.
                </td>
              </tr>
            ) : (
              auditRows.map((audit, index) => (
                <tr key={`${audit.timestamp}-${index}`}>
                  <td>{new Date(audit.timestamp).toLocaleString()}</td>
                  <td>{audit.event}</td>
                  <td>{audit.created_by}</td>
                  <td>{audit.note || ""}</td>
                  <td className="mixture-audit__details">
                    {audit.details
                      ? JSON.stringify(audit.details, null, 2)
                      : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <WarnModal
        showModal={showDrawModal}
        setShowModal={setShowDrawModal}
        dangerousActionName="Draw"
        onContinue={async () => {
          if (!pendingDraw) return;
          setShowDrawModal(false);
          setIsSubmittingDraw(true);
          const updated = await performMixtureUpdate((mixture) =>
            mixture.draw(pendingDraw)
          );
          setIsSubmittingDraw(false);
          if (updated) {
            setPendingDraw(null);
            setDrawForm({ quantity: "", createdBy: "", note: "" });
            setToastContent({
              content: (
                <div>
                  Drew {pendingDraw.quantity} from <ItemLabel label={mixture.state.mix_id} />
                </div>
              ),
              mode: "success",
            });
          }
        }}
      >
        {pendingDraw ? (
          <p>
            Draw {pendingDraw.quantity} from mixture {mixture.state.mix_id}?
          </p>
        ) : null}
      </WarnModal>

      <WarnModal
        showModal={showSplitModal}
        setShowModal={setShowSplitModal}
        dangerousActionName="Split"
        onContinue={async () => {
          if (!pendingSplit) return;
          setShowSplitModal(false);
          setIsSubmittingSplit(true);
          const updated = await performMixtureUpdate((mixture) =>
            mixture.split(pendingSplit)
          );
          setIsSubmittingSplit(false);
          if (updated) {
            setPendingSplit(null);
            setSplitForm({
              quantity: "",
              destinationBin: "",
              newMixId: "",
              createdBy: "",
              note: "",
            });
            setToastContent({
              content: (
                <div>
                  Split {pendingSplit.quantity} from <ItemLabel label={mixture.state.mix_id} /> into {" "}
                  <ItemLabel label={pendingSplit.destination_bin} />
                </div>
              ),
              mode: "success",
            });
          }
        }}
      >
        {pendingSplit ? (
          <p>
            Split {pendingSplit.quantity} to {pendingSplit.destination_bin} as {pendingSplit.new_mix_id}?
          </p>
        ) : null}
      </WarnModal>
    </div>
  );
}

export default Mixture;
