const redirects: Record<string, string> = {
  "/application-intelligence": "/applications?tab=adapters",
  "/audit": "/security?tab=audit",
  "/command-studio": "/automation?tab=demonstrations",
  "/commands": "/automation?tab=commands",
  "/conversations": "/conversation",
  "/desktop": "/applications?tab=capabilities",
  "/executive": "/skills",
  "/gesture-lab": "/spatial",
  "/infrastructure": "/ai?tab=advanced",
  "/integrations": "/applications?tab=integrations",
  "/knowledge-graph": "/memory?tab=knowledge",
  "/local-ai": "/ai",
  "/personality": "/voice?tab=personality",
  "/policies": "/security?tab=policies",
  "/read-only-tools": "/engineering?tab=inspection",
  "/repositories": "/engineering?tab=repositories",
  "/semantic": "/memory?tab=retrieval",
  "/semantic-workspace": "/engineering?tab=indexing",
  "/settings": "/security?tab=sessions",
  "/tasks": "/automation?tab=tasks",
  "/validations": "/engineering?tab=validation",
  "/workspaces": "/workspace",
  "/advisor": "/engineering?tab=advisor",
};

export const legacyRoute = (pathname: string, search: string) => {
  const tab = new URLSearchParams(search).get("tab");
  if (pathname === "/agents" && tab === "workflows") return "/workflows";
  if (pathname === "/agents" && tab === "skills") return "/skills";
  if (pathname === "/workspace" && tab === "applications") return "/applications";
  if (pathname === "/security" && tab === "approvals") return "/approvals";

  const target = redirects[pathname];
  if (!target) return null;
  return `${target}${search && !target.includes("?") ? search : ""}`;
};
