import {
  DepartmentTemplateSchema,
  type DepartmentTemplate,
} from "@alexa-control/shared";

const template = (
  id: string,
  name: string,
  category: string,
  genericPurpose: string,
  suggestedAgentRoles: string[],
): DepartmentTemplate =>
  DepartmentTemplateSchema.parse({
    id,
    canonicalKey: id,
    name,
    category,
    genericPurpose,
    suggestedManagerRole: "engineering_manager",
    suggestedAgentRoles,
    defaultPolicyHints: ["company-scoped", "lazy-runtime", "owner-managed"],
    provenance: "SYSTEM",
    status: "ACTIVE",
  });

export const DEPARTMENT_TEMPLATES: DepartmentTemplate[] = [
  template(
    "operations",
    "Operations",
    "Operations",
    "Coordinate repeatable internal operations and delivery readiness.",
    ["planning", "release", "review"],
  ),
  template(
    "finance",
    "Finance",
    "Business",
    "Support bounded planning, forecasting, and economic analysis.",
    ["planning", "review"],
  ),
  template(
    "sales-growth",
    "Sales & Growth",
    "Revenue",
    "Support account research, outreach preparation, and revenue operations.",
    ["planning", "documentation", "review"],
  ),
  template(
    "marketing",
    "Marketing",
    "Revenue",
    "Coordinate market communication, content, and growth analysis.",
    ["planning", "documentation", "review"],
  ),
  template(
    "customer-success",
    "Customer Success",
    "Customer",
    "Support onboarding, service intelligence, and retention work.",
    ["documentation", "planning", "review"],
  ),
  template(
    "product",
    "Product",
    "Product",
    "Coordinate product discovery, planning, and evidence synthesis.",
    ["planning", "review"],
  ),
  template(
    "engineering",
    "Engineering",
    "Product",
    "Deliver bounded architecture, implementation, and validation work.",
    ["coding", "testing", "review"],
  ),
  template(
    "design",
    "Design",
    "Product",
    "Support user experience research and design quality review.",
    ["planning", "review"],
  ),
  template(
    "research",
    "Research",
    "Strategy",
    "Gather, evaluate, and synthesize bounded evidence.",
    ["planning", "review", "documentation"],
  ),
  template(
    "strategy",
    "Strategy",
    "Strategy",
    "Coordinate company planning, priorities, and decision support.",
    ["planning", "review"],
  ),
  template(
    "analytics",
    "Analytics",
    "Strategy",
    "Support metric interpretation and bounded analytical work.",
    ["planning", "review"],
  ),
  template(
    "quality-review",
    "Quality / Review",
    "Governance",
    "Provide independent verification, quality review, and acceptance checks.",
    ["testing", "review", "security"],
  ),
  template(
    "delivery",
    "Delivery",
    "Operations",
    "Coordinate delivery planning, dependencies, and status reporting.",
    ["planning", "release", "documentation"],
  ),
];
