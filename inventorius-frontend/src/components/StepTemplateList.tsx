import * as React from "react";
import { generatePath, Link } from "react-router-dom";

import "../styles/StepTemplates.css";

const placeholderTemplates = [
  { id: "tmpl-001", name: "Blend Base Oils" },
  { id: "tmpl-002", name: "Infuse Botanicals" },
  { id: "tmpl-003", name: "Bottle Final Product" },
];

function StepTemplateList() {
  return (
    <section className="info-panel step-template-list">
      <div className="info-item">
        <div className="info-item-title">Step Templates</div>
        <div className="info-item-description">
          <p>
            Templates describe the expected inputs and outputs for repeated
            manufacturing operations. This placeholder will list saved
            templates and link to their detailed configuration screens.
          </p>
        </div>
      </div>
      {placeholderTemplates.map((template) => (
        <div className="info-item" key={template.id}>
          <div className="info-item-title">{template.name}</div>
          <div className="info-item-description">
            <span className="step-template-list__identifier">{template.id}</span>
            <Link
              className="action-link"
              to={generatePath("/step-template/:id", { id: template.id })}
            >
              View template
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}

export default StepTemplateList;
