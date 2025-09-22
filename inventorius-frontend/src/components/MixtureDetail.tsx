import * as React from "react";
import { useParams } from "react-router-dom";

import "../styles/MixtureDetail.css";

function MixtureDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <section className="info-panel mixture-detail">
      <div className="info-item">
        <div className="info-item-title">Mixture Identifier</div>
        <div className="info-item-description">
          <span>{id}</span>
          <span className="info-panel__hint">
            Detailed lineage and bin activity will appear here.
          </span>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Component Batches</div>
        <div className="info-item-description">
          <p>
            This placeholder will show the batches that were combined to form
            the mixture along with their remaining quantities.
          </p>
        </div>
      </div>
      <div className="info-item">
        <div className="info-item-title">Recent Activity</div>
        <div className="info-item-description">
          <p>
            Activity such as draws, splits, and adjustments will be summarised
            in this section to aid traceability.
          </p>
        </div>
      </div>
    </section>
  );
}

export default MixtureDetail;
