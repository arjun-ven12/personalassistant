const COMPANY_INDEPENDENT_QUERY_ROOTS = new Set(["auth-session", "companies"]);

/** Company-scoped query data must never survive an active-company switch. */
export const retainQueryAcrossCompanySwitch = (queryKey: readonly unknown[]) =>
  COMPANY_INDEPENDENT_QUERY_ROOTS.has(String(queryKey[0]));
