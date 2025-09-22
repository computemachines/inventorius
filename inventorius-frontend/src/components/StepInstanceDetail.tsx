import * as React from "react";
import { useParams } from "react-router-dom";

import "../styles/StepInstances.css";

function StepInstanceDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <section className="info-panel step-instance-detail">
      <div className="info-item">
        <div className="info-item-title">Instance</div>
        <div className="info-item-description">
          <span>{id}</span>
          <p className="step-instance-detail__hint">
            Execution metadata, operator assignments, and audit history will be
            displayed here.
          </p>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Consumed Inputs</div>
        <div className="info-item-description">
          <p>
            Placeholder rows will expand into a detailed list of batches and
            mixtures that were drawn for this step.
          </p>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Produced Outputs</div>
        <div className="info-item-description">
          <p>
            The outputs section will enumerate resulting batches and their
            quantities for downstream tracking.
          </p>
        </div>
      </div>
    </section>
  );
}

export default StepInstanceDetail;
