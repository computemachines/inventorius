import * as React from "react";
import { useParams } from "react-router-dom";

import "../styles/StepTemplates.css";

function StepTemplateDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <section className="info-panel step-template-detail">
      <div className="info-item">
        <div className="info-item-title">Template</div>
        <div className="info-item-description">
          <span>{id}</span>
          <p className="step-template-detail__hint">
            Configure SKU requirements, default notes, and safety checks here.
          </p>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Expected Inputs</div>
        <div className="info-item-description">
          <p>
            A structured editor will describe mandatory and optional input SKUs,
            including quantity guidance for operators.
          </p>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Expected Outputs</div>
        <div className="info-item-description">
          <p>
            Planned output SKUs and nominal quantities will be captured in this
            section for quick reference during instance creation.
          </p>
        </div>
      </div>
    </section>
  );
}

export default StepTemplateDetail;
