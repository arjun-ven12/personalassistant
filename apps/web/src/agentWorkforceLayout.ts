import type { WorkforceGraphResponse } from "@alexa-control/shared";

export type PositionedWorkforceNode = WorkforceGraphResponse["nodes"][number] & {
  x: number;
  y: number;
};

export const layoutWorkforceGraph = (
  graph: WorkforceGraphResponse,
): { nodes: PositionedWorkforceNode[]; width: number; height: number } => {
  const governor = graph.nodes.find((node) => node.kind === "GOVERNOR");
  const departments = graph.nodes.filter((node) => node.kind === "DEPARTMENT");
  const agents = graph.nodes.filter((node) => node.kind === "AGENT");
  const rowHeight = 286;
  const maxAgentsPerColumn = 4;
  const positioned: PositionedWorkforceNode[] = [];
  const largestDepartment = departments.reduce(
    (largest, department) => Math.max(
      largest,
      agents.filter((agent) => agent.departmentId === department.departmentId).length,
    ),
    0,
  );
  const agentColumns = Math.max(1, Math.ceil(largestDepartment / maxAgentsPerColumn));
  const width = Math.max(1_740, 680 + agentColumns * 292);
  const height = Math.max(760, departments.length * rowHeight + 120);

  if (governor) positioned.push({ ...governor, x: 48, y: height / 2 - 30 });
  departments.forEach((department, index) => {
    const y = 48 + index * rowHeight;
    positioned.push({ ...department, x: 330, y });
    const departmentAgents = agents.filter(
      (agent) => agent.departmentId === department.departmentId,
    );
    departmentAgents.forEach((agent, agentIndex) => {
      const column = Math.floor(agentIndex / maxAgentsPerColumn);
      const row = agentIndex % maxAgentsPerColumn;
      positioned.push({
        ...agent,
        x: 660 + column * 292,
        y: y - 4 + row * 68,
      });
    });
  });

  return { nodes: positioned, width, height };
};
