import * as React from "react";
import { generatePath, Link } from "react-router-dom";

import "../styles/StepInstances.css";

const placeholderInstances = [
  { id: "inst-1001", template: "Blend Base Oils" },
  { id: "inst-1002", template: "Infuse Botanicals" },
  { id: "inst-1003", template: "Bottle Final Product" },
];

function StepInstanceList() {
  return (
    <section className="info-panel step-instance-list">
      <div className="info-item">
        <div className="info-item-title">Step Instances</div>
        <div className="info-item-description">
          <p>
            Instances capture how a template was executed, including actual
            inputs, outputs, and operator notes. This placeholder offers sample
            rows that will eventually be replaced with API data.
          </p>
        </div>
      </div>
      {placeholderInstances.map((instance) => (
        <div className="info-item" key={instance.id}>
          <div className="info-item-title">{instance.template}</div>
          <div className="info-item-description">
            <span className="step-instance-list__identifier">{instance.id}</span>
            <Link
              className="action-link"
              to={generatePath("/step-instance/:id", { id: instance.id })}
            >
              View instance
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}

export default StepInstanceList;
