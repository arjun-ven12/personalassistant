type CompanyHealthState = {
  state: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
};

export const portfolioCompanyState = (health: CompanyHealthState[]) => {
  if (health.some((item) => item.state === "CRITICAL"))
    return { label: "CRITICAL", tone: "CRITICAL" } as const;
  if (health.some((item) => item.state === "WARNING"))
    return { label: "ATTENTION", tone: "WARNING" } as const;
  if (!health.length || health.some((item) => item.state === "UNKNOWN"))
    return { label: "INSUFFICIENT DATA", tone: "UNKNOWN" } as const;
  return { label: "STABLE", tone: "HEALTHY" } as const;
};
