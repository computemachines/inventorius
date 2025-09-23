import * as React from "react";
import { Link, generatePath } from "react-router-dom";
import { useFrontload } from "react-frontload";

import { FrontloadContext } from "../api-client/api-client";
import { Problem, StepTemplate } from "../api-client/data-models";
import DataTable, { HeaderSpec } from "./DataTable";

import "../styles/StepTemplateList.css";

function StepTemplateList() {
  const { data, frontloadMeta } = useFrontload(
    "step-template-list",
    async ({ api }: FrontloadContext) => ({
      templates: await api.listStepTemplates(),
    })
  );

  const loading = frontloadMeta.pending;

  if (loading) {
    return <div>Loading...</div>;
  }

  if (frontloadMeta.error) {
    return <div>Unable to load step templates.</div>;
  }

  const { templates } = data as { templates: StepTemplate[] | Problem };

  if ((templates as Problem).kind === "problem") {
    const problem = templates as Problem;
    return (
      <section className="info-panel step-template-list">
        <div className="info-item">
          <div className="info-item-title">Step Templates</div>
          <div className="info-item-description">
            <p>{problem.title || "Problem fetching templates."}</p>
          </div>
          <Link className="action-link" to="/new/step-template">
            Create template
          </Link>
        </div>
      </section>
    );
  }

  const templatesArray = [...(templates as StepTemplate[])].sort((a, b) => {
    const nameA = a.state.name || a.state.template_id;
    const nameB = b.state.name || b.state.template_id;
    return nameA.localeCompare(nameB);
  });

  const headers = ["Name", "Template ID", "Inputs", "Outputs"] as const;
  const tableData = templatesArray.map((template) => ({
    [headers[0]]: (
      <Link
        to={generatePath("/step-template/:id", {
          id: template.state.template_id,
        })}
        className="step-template-list__name"
      >
        {template.state.name || template.state.template_id}
      </Link>
    ),
    [headers[1]]: template.state.template_id,
    [headers[2]]: template.state.inputs?.length || 0,
    [headers[3]]: template.state.outputs?.length || 0,
  }));

  return (
    <section className="info-panel step-template-list">
      <div className="info-item">
        <div className="info-item-title">Step Templates</div>
        <div className="info-item-description step-template-list__description">
          <p>
            Templates describe the expected inputs and outputs for repeated
            manufacturing operations. Use them to predefine the I/O profile for
            each production step.
          </p>
          <Link className="action-link" to="/new/step-template">
            Create template
          </Link>
        </div>
      </div>
      <div className="info-item">
        <DataTable
          headers={[...headers]}
          data={tableData}
          headerSpecs={{
            [headers[0]]: new HeaderSpec(".truncated", {
              kind: "min-max-width",
              minWidth: 160,
              maxWidth: "1fr",
            }),
            [headers[1]]: new HeaderSpec("string", {
              kind: "min-max-width",
              minWidth: 140,
              maxWidth: 220,
            }),
            [headers[2]]: new HeaderSpec(".numeric", {
              kind: "fixed-width",
              width: 90,
            }),
            [headers[3]]: new HeaderSpec(".numeric", {
              kind: "fixed-width",
              width: 90,
            }),
          }}
          loading={false}
        />
        {templatesArray.length === 0 && (
          <p className="step-template-list__empty">No templates have been created yet.</p>
        )}
      </div>
    </section>
  );
}

export default StepTemplateList;
