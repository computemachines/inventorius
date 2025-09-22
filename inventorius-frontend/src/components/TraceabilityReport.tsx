import * as React from "react";

import "../styles/TraceabilityReport.css";

function TraceabilityReport() {
  return (
    <section className="info-panel traceability-report">
      <div className="info-item">
        <div className="info-item-title">Traceability Report</div>
        <div className="info-item-description">
          <p>
            Use this workspace to generate downstream usage reports for batches
            and mixtures. Filters, date ranges, and output modes will be added
            in future iterations.
          </p>
        </div>
      </div>
      <form className="traceability-report__form form">
        <label className="traceability-report__field">
          <span className="traceability-report__label form-label">
            Batch or Mixture ID
          </span>
          <input
            aria-label="Batch or mixture identifier"
            className="traceability-report__input"
            placeholder="e.g. BAT123 or Mx42"
            type="text"
          />
        </label>
        <label className="traceability-report__field">
          <span className="traceability-report__label form-label">
            Report Scope
          </span>
          <select aria-label="Report scope" className="traceability-report__input">
            <option value="downstream">Downstream usage</option>
            <option value="upstream">Upstream provenance</option>
          </select>
        </label>
        <button className="traceability-report__submit" type="button">
          Generate preview
        </button>
      </form>
      <div className="traceability-report__preview">
        <p>
          Report results will render in this area once the backend endpoints are
          connected.
        </p>
      </div>
    </section>
  );
}

export default TraceabilityReport;
