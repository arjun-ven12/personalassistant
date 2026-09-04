import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Building2,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  Home,
  Layers3,
  MemoryStick,
  Mic2,
  MonitorCog,
  Search,
  Shield,
  Sparkles,
  Target,
  UserCircle,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AuditPage } from "./AuditPage.js";
import { ApplicationsPage } from "./ApplicationsPage.js";
import { CapabilityStudioPage } from "./CapabilityStudioPage.js";
import { ApplicationIntelligencePage } from "./ApplicationIntelligencePage.js";
import { ApprovalsPage } from "./ApprovalsPage.js";
import { AuthPage } from "./AuthPage.js";
import { DevicesPage } from "./DevicesPage.js";
import { Dashboard } from "./Dashboard.js";
import { SettingsPage } from "./SettingsPage.js";
import { SecurityPage } from "./SecurityPage.js";
import { SemanticPage } from "./SemanticPage.js";
import { SemanticWorkspacePage } from "./SemanticWorkspacePage.js";
import { PoliciesPage } from "./PoliciesPage.js";
import { WorkspacesPage } from "./WorkspacesPage.js";
import { ReadOnlyToolsPage } from "./ReadOnlyToolsPage.js";
import { RepositoriesPage } from "./RepositoriesPage.js";
import { ValidationsPage } from "./ValidationsPage.js";
import { WorkflowsPage } from "./WorkflowsPage.js";
import { IntegrationsPage } from "./IntegrationsPage.js";
import { AgentsPage } from "./AgentsPage.js";
import { MemoryPage } from "./MemoryPage.js";
import { InfrastructurePage } from "./InfrastructurePage.js";
import { LocalAIPage } from "./LocalAIPage.js";
import { KnowledgeGraphPage } from "./KnowledgeGraphPage.js";
import { AdvisorPage } from "./AdvisorPage.js";
import { CommandsPage } from "./CommandsPage.js";
import { CompaniesPage } from "./CompaniesPage.js";
import { PortfolioPage } from "./PortfolioPage.js";
import { CrossCompanyServicesPage } from "./CrossCompanyServicesPage.js";
import { CommandStudioPage } from "./CommandStudioPage.js";
import { ConversationPage } from "./ConversationPage.js";
import { ExecutivePage } from "./ExecutivePage.js";
import { ObjectivesPage } from "./ObjectivesPage.js";
import { PersonalityPage } from "./PersonalityPage.js";
import { PersistentSpatialRuntimeProvider } from "./PersistentSpatialRuntime.js";
import { PersistentVoiceRuntimeProvider } from "./PersistentVoiceRuntime.js";
import { SpatialPage } from "./SpatialPage.js";
import { SpatialCommandSpace } from "./SpatialCommandSpace.js";
import { TasksPage } from "./TasksPage.js";
import { VoicePage } from "./VoicePage.js";
import { TabbedWorkspacePage, type WorkspaceTab } from "./TabbedWorkspacePage.js";
import { OperationalPage } from "./OperationalPage.js";
import { legacyRoute } from "./appRouting.js";
import { ApiClientError, type ApiClient } from "./api.js";
import { retainQueryAcrossCompanySwitch } from "./companyQueryCache.js";
import { CrossDeviceRuntime } from "./CrossDeviceRuntime.js";
import {
  Spatial,
  SpatialFrameworkProvider,
  type SpatialComponentEvent,
} from "./spatial-ui/SpatialFramework.js";

const navigation: Array<{
  path: string;
  label: string;
  icon: LucideIcon;
  section: "Home" | "Personal" | "Operations" | "Environment" | "System" | "Developer";
}> = [
  { path: "/", label: "Home", icon: Home, section: "Home" },
  { path: "/voice", label: "Voice", icon: Mic2, section: "Personal" },
  {
    path: "/conversation",
    label: "Conversation",
    icon: UserCircle,
    section: "Personal",
  },
  { path: "/memory", label: "Memory", icon: MemoryStick, section: "Personal" },
  { path: "/automation", label: "Automation", icon: Zap, section: "Operations" },
  { path: "/agents", label: "Agents", icon: Bot, section: "Operations" },
  { path: "/workflows", label: "Workflows", icon: Workflow, section: "Operations" },
  { path: "/objectives", label: "Objectives", icon: Target, section: "Operations" },
  { path: "/skills", label: "Skills", icon: Sparkles, section: "Operations" },
  {
    path: "/applications",
    label: "Applications",
    icon: Layers3,
    section: "Environment",
  },
  { path: "/workspace", label: "Workspace", icon: Boxes, section: "Environment" },
  { path: "/devices", label: "Devices", icon: Cpu, section: "Environment" },
  { path: "/spatial", label: "Spatial", icon: Sparkles, section: "Environment" },
  { path: "/ai", label: "AI", icon: BrainCircuit, section: "System" },
  { path: "/companies", label: "Companies", icon: Building2, section: "System" },
  { path: "/portfolio", label: "Portfolio", icon: Gauge, section: "System" },
  { path: "/services", label: "Services", icon: Activity, section: "System" },
  { path: "/security", label: "Security", icon: Shield, section: "System" },
  { path: "/approvals", label: "Approvals", icon: CheckCircle2, section: "System" },
  {
    path: "/engineering",
    label: "Engineering",
    icon: MonitorCog,
    section: "Developer",
  },
];

const navigationSections = [
  "Home",
  "Personal",
  "Operations",
  "Environment",
  "System",
  "Developer",
] as const;

export const App = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  const [clock, setClock] = useState(() =>
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date()),
  );
  useEffect(() => {
    const handlePopState = () =>
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    }, 1_000);
    return () => window.clearInterval(interval);
  }, []);
  const auth = useQuery({
    queryKey: ["auth-session"],
    queryFn: apiClient.getAuthState,
    retry: false,
  });
  const authenticated = Boolean(auth.data?.authenticated && auth.data.user);
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: apiClient.getCompanies,
    enabled: authenticated,
    retry: false,
  });
  const selectCompany = useMutation({
    mutationFn: apiClient.selectCompany,
    onSuccess: async (data) => {
      queryClient.removeQueries({
        predicate: (query) => !retainQueryAcrossCompanySwitch(query.queryKey),
      });
      queryClient.setQueryData(["companies"], data);
      navigate("/");
      await queryClient.invalidateQueries();
    },
  });
  const commandSpace = useQuery({
    queryKey: ["spatial-command-space"],
    queryFn: apiClient.getSpatialCommandSpace,
    refetchInterval: 30_000,
    enabled: authenticated,
  });
  const setSpatialMode = useMutation({
    mutationFn: apiClient.setSpatialMode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spatial-command-space"] });
    },
  });
  const navigate = useCallback((path: string, replace = false) => {
    const next = new URL(path, window.location.origin);
    window.history[replace ? "replaceState" : "pushState"]({}, "", next);
    setLocation({ pathname: next.pathname, search: next.search });
  }, []);
  const redirected = legacyRoute(location.pathname, location.search);
  const pathname = redirected
    ? new URL(redirected, window.location.origin).pathname
    : location.pathname;
  const search = redirected
    ? new URL(redirected, window.location.origin).search
    : location.search;
  const activeTab = new URLSearchParams(search).get("tab") ?? "";
  const pendingApprovals = useQuery({
    queryKey: ["approvals", "pending-shortcut"],
    queryFn: () => apiClient.getApprovals("PENDING"),
    refetchInterval: 15_000,
    enabled: authenticated,
  });

  useEffect(() => {
    if (redirected) navigate(redirected, true);
  }, [navigate, redirected]);

  if (auth.isPending) {
    return <main className="loading-screen">Checking secure session…</main>;
  }
  if (auth.error instanceof ApiClientError && auth.error.status === 401) {
    return <AuthPage apiClient={apiClient} />;
  }
  if (!auth.data?.authenticated || !auth.data.user) {
    return <AuthPage apiClient={apiClient} />;
  }

  const logout = async () => {
    await apiClient.logout();
    queryClient.clear();
    await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
  };
  const selectTab = (route: string, tab: string) => navigate(`${route}?tab=${tab}`);
  const spatialModeEnabled =
    commandSpace.data?.preferences[0]?.spatialModeEnabled ?? false;
  const recordSpatialInteraction = (event: SpatialComponentEvent) => {
    void apiClient
      .recordSpatialInteractionMetric({
        componentId: event.targetId,
        eventType: event.type,
        state: event.state,
        confidence: event.confidence,
        latencyMs: Math.max(0, Date.now() - event.at),
      })
      .catch(() => undefined);
  };
  const voiceTabs: WorkspaceTab[] = [
    {
      id: "session",
      label: "Current session",
      content: <VoicePage apiClient={apiClient} />,
    },
    {
      id: "personality",
      label: "Personality",
      content: <PersonalityPage apiClient={apiClient} />,
    },
  ];
  const memoryTabs: WorkspaceTab[] = [
    {
      id: "memories",
      label: "Memories",
      content: <MemoryPage apiClient={apiClient} />,
    },
    {
      id: "knowledge",
      label: "Knowledge",
      content: <KnowledgeGraphPage apiClient={apiClient} />,
    },
    {
      id: "retrieval",
      label: "Retrieval",
      content: <SemanticPage apiClient={apiClient} />,
    },
  ];
  const automationTabs: WorkspaceTab[] = [
    {
      id: "tasks",
      label: "Tasks & schedules",
      content: <TasksPage apiClient={apiClient} />,
    },
    {
      id: "commands",
      label: "Commands",
      content: <CommandsPage apiClient={apiClient} />,
    },
    {
      id: "demonstrations",
      label: "Demonstrations",
      advanced: true,
      content: <CommandStudioPage apiClient={apiClient} />,
    },
    {
      id: "history",
      label: "History",
      advanced: true,
      content: <CommandsPage apiClient={apiClient} />,
    },
  ];
  const workspaceTabs: WorkspaceTab[] = [
    {
      id: "workspaces",
      label: "Workspaces",
      content: <WorkspacesPage apiClient={apiClient} />,
    },
    {
      id: "context",
      label: "Context",
      advanced: true,
      content: <SemanticWorkspacePage apiClient={apiClient} />,
    },
  ];
  const aiTabs: WorkspaceTab[] = [
    {
      id: "models",
      label: "Models",
      content: <LocalAIPage apiClient={apiClient} view="models" />,
    },
    {
      id: "routing",
      label: "Routing",
      content: <LocalAIPage apiClient={apiClient} view="routing" />,
    },
    {
      id: "context",
      label: "Context",
      content: <LocalAIPage apiClient={apiClient} view="context" />,
    },
    {
      id: "usage",
      label: "Usage",
      content: <LocalAIPage apiClient={apiClient} view="usage" />,
    },
    {
      id: "evaluation",
      label: "Evaluation",
      content: <LocalAIPage apiClient={apiClient} view="evaluation" />,
    },
    {
      id: "advanced",
      label: "Advanced",
      advanced: true,
      content: <InfrastructurePage apiClient={apiClient} />,
    },
  ];
  const securityTabs: WorkspaceTab[] = [
    {
      id: "overview",
      label: "Overview",
      content: <SecurityPage apiClient={apiClient} />,
    },
    {
      id: "policies",
      label: "Policies",
      content: <PoliciesPage apiClient={apiClient} />,
    },
    {
      id: "sessions",
      label: "Sessions",
      content: <SettingsPage apiClient={apiClient} />,
    },
    {
      id: "audit",
      label: "Audit",
      advanced: true,
      content: <AuditPage apiClient={apiClient} />,
    },
  ];
  const engineeringTabs: WorkspaceTab[] = [
    {
      id: "repositories",
      label: "Repositories",
      content: <RepositoriesPage apiClient={apiClient} />,
    },
    {
      id: "validation",
      label: "Validation",
      content: <ValidationsPage apiClient={apiClient} />,
    },
    {
      id: "inspection",
      label: "Inspection",
      content: <ReadOnlyToolsPage apiClient={apiClient} />,
    },
    {
      id: "indexing",
      label: "Indexing",
      content: <SemanticWorkspacePage apiClient={apiClient} />,
    },
    { id: "advisor", label: "Advisor", content: <AdvisorPage apiClient={apiClient} /> },
  ];
  const applicationTabs: WorkspaceTab[] = [
    {
      id: "applications",
      label: "Applications",
      content: <ApplicationsPage apiClient={apiClient} />,
    },
    {
      id: "capabilities",
      label: "Capabilities",
      content: <CapabilityStudioPage apiClient={apiClient} />,
    },
    {
      id: "integrations",
      label: "Integrations",
      content: <IntegrationsPage apiClient={apiClient} />,
    },
    {
      id: "adapters",
      label: "Adapters",
      advanced: true,
      content: <ApplicationIntelligencePage apiClient={apiClient} />,
    },
  ];

  return (
    <SpatialFrameworkProvider onInteraction={recordSpatialInteraction}>
      <PersistentSpatialRuntimeProvider apiClient={apiClient} onNavigate={navigate}>
        <PersistentVoiceRuntimeProvider apiClient={apiClient} onNavigate={navigate}>
          {spatialModeEnabled ? (
            <SpatialCommandSpace
              apiClient={apiClient}
              onExit={() => {
                setSpatialMode.mutate({ enabled: false, source: "dashboard" });
              }}
            />
          ) : null}
          {!spatialModeEnabled ? (
            <>
              <CrossDeviceRuntime apiClient={apiClient} navigate={navigate} />
              <div
                className={`app-shell ${pathname === "/" ? "home-shell" : "operational-shell"}`}
              >
                <div className="ambient-grid" aria-hidden="true" />
                <div className="ambient-orb ambient-orb-primary" aria-hidden="true" />
                <div className="ambient-orb ambient-orb-secondary" aria-hidden="true" />
                <header className="topbar">
                  <div className="brand-cluster">
                    <span className="brand-mark">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <p className="product-kicker">AI command operating system</p>
                      <span className="product-name">Athena Control</span>
                    </div>
                  </div>
                  <div className="command-palette" role="search">
                    <Search size={16} />
                    <input
                      id="global-command-search"
                      aria-label="Global command palette"
                      placeholder="Search repositories, agents, workflows, symbols…"
                      type="search"
                    />
                    <kbd>⌘K</kbd>
                  </div>
                  <div className="owner-menu">
                    <label className="company-switcher">
                      <span>Company</span>
                      <select
                        aria-label="Active company"
                        disabled={companies.isPending || selectCompany.isPending}
                        onChange={(event) => {
                          if (event.target.value === "__portfolio__") navigate("/portfolio");
                          else selectCompany.mutate(event.target.value);
                        }}
                        value={pathname === "/portfolio" ? "__portfolio__" : companies.data?.currentCompany.id ?? ""}
                      >
                        <option value="__portfolio__">All Companies</option>
                        {companies.data?.companies
                          .filter((company) => company.status === "ACTIVE")
                          .map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <span className="system-pill">
                      <span className="live-dot" />
                      Online
                    </span>
                    <span className="system-pill">
                      <Database size={14} />
                      Postgres
                    </span>
                    <span className="system-pill">
                      <Gauge size={14} />
                      {clock}
                    </span>
                    <button
                      className="text-button spatial-mode-button"
                      disabled={setSpatialMode.isPending}
                      onClick={() =>
                        setSpatialMode.mutate({ enabled: true, source: "dashboard" })
                      }
                      type="button"
                    >
                      <Sparkles size={14} /> Spatial Mode
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void logout()}
                      type="button"
                    >
                      Log out
                    </button>
                    <UserCircle size={18} aria-label={auth.data.user.email} />
                  </div>
                </header>

                <aside className="sidebar" aria-label="Primary navigation">
                  <nav>
                    {navigationSections.map((section) => (
                      <div className="nav-section" key={section}>
                        <span>{section}</span>
                        {navigation
                          .filter((item) => item.section === section)
                          .map(({ path, label, icon: Icon }) => (
                            <Spatial
                              as="a"
                              className={pathname === path ? "active" : undefined}
                              href={path}
                              key={path}
                              onClick={(event) => {
                                event.preventDefault();
                                navigate(path);
                              }}
                              onSpatialEvent={(event) => {
                                if (event.type === "spatial_activate") navigate(path);
                              }}
                              spatialId={`nav:${path}`}
                              spatialLabel={label}
                              spatialType="link"
                            >
                              <Icon size={17} />
                              <span>{label}</span>
                              {path === "/approvals" &&
                              (pendingApprovals.data?.length ?? 0) > 0 ? (
                                <small className="nav-count">
                                  {pendingApprovals.data?.length}
                                </small>
                              ) : null}
                            </Spatial>
                          ))}
                      </div>
                    ))}
                  </nav>
                  <div className="sidebar-boundary">
                    <strong>Identity is not authority</strong>
                    <span>
                      Agents, workflows, and integrations remain approval gated.
                    </span>
                  </div>
                </aside>

                <main className="content">
                  {pathname === "/" ? <Dashboard apiClient={apiClient} /> : null}
                  {pathname === "/devices" ? (
                    <DevicesPage apiClient={apiClient} />
                  ) : null}
                  {pathname === "/companies" ? (
                    <CompaniesPage
                      apiClient={apiClient}
                      onSelect={(companyId) => selectCompany.mutate(companyId)}
                    />
                  ) : null}
                  {pathname === "/portfolio" ? (
                    <PortfolioPage
                      apiClient={apiClient}
                      onOpenCompany={(companyId) =>
                        selectCompany.mutate(companyId, {
                          onSuccess: () => navigate("/companies"),
                        })
                      }
                    />
                  ) : null}
                  {pathname === "/services" ? (
                    <CrossCompanyServicesPage apiClient={apiClient} />
                  ) : null}
                  {pathname === "/spatial" ? (
                    <SpatialPage apiClient={apiClient} onNavigate={navigate} />
                  ) : null}
                  {pathname === "/voice" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "session"}
                      description="Manage the live voice session, voice controls, and communication style."
                      onTabChange={(tab) => selectTab("/voice", tab)}
                      tabs={voiceTabs}
                      title="Voice"
                    />
                  ) : null}
                  {pathname === "/conversation" ? (
                    <OperationalPage
                      description="Review current and recent conversations, feedback, and saved moments."
                      title="Conversation"
                    >
                      <ConversationPage apiClient={apiClient} />
                    </OperationalPage>
                  ) : null}
                  {pathname === "/memory" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "memories"}
                      description="Search what Athena remembers, inspect knowledge, and review retrieval."
                      onTabChange={(tab) => selectTab("/memory", tab)}
                      tabs={memoryTabs}
                      title="Memory"
                    />
                  ) : null}
                  {pathname === "/automation" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "tasks"}
                      description="Manage the work Athena is tracking, scheduling, and routing."
                      onTabChange={(tab) => selectTab("/automation", tab)}
                      tabs={automationTabs}
                      title="Automation"
                    />
                  ) : null}
                  {pathname === "/agents" ? <AgentsPage apiClient={apiClient} /> : null}
                  {pathname === "/workflows" ? (
                    <OperationalPage
                      description="Coordinate and monitor multi-step autonomous work."
                      title="Workflows"
                    >
                      <WorkflowsPage apiClient={apiClient} />
                    </OperationalPage>
                  ) : null}
                  {pathname === "/objectives" ? (
                    <ObjectivesPage apiClient={apiClient} />
                  ) : null}
                  {pathname === "/skills" ? (
                    <OperationalPage
                      description="Review Athena's learned capabilities, health, and evolution."
                      title="Skills"
                    >
                      <ExecutivePage apiClient={apiClient} />
                    </OperationalPage>
                  ) : null}
                  {pathname === "/applications" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "workspaces"}
                      description="See the applications Athena can understand, integrate with, and control."
                      onTabChange={(tab) => selectTab("/applications", tab)}
                      tabs={applicationTabs}
                      title="Applications"
                    />
                  ) : null}
                  {pathname === "/workspace" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "applications"}
                      description="Manage trusted projects, folders, and the context Athena can use."
                      onTabChange={(tab) => selectTab("/workspace", tab)}
                      tabs={workspaceTabs}
                      title="Workspace"
                    />
                  ) : null}
                  {pathname === "/ai" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "models"}
                      description="See the models powering Athena, how requests are routed, and governed spend."
                      onTabChange={(tab) => selectTab("/ai", tab)}
                      tabs={aiTabs}
                      title="AI"
                    />
                  ) : null}
                  {pathname === "/security" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "overview"}
                      description="Review Athena's safety posture, approvals, policies, sessions, and evidence."
                      onTabChange={(tab) => selectTab("/security", tab)}
                      tabs={securityTabs}
                      title="Security"
                    />
                  ) : null}
                  {pathname === "/approvals" ? (
                    <OperationalPage
                      description="Review decisions waiting for your approval and recent outcomes."
                      title="Approvals"
                    >
                      <ApprovalsPage apiClient={apiClient} />
                    </OperationalPage>
                  ) : null}
                  {pathname === "/engineering" ? (
                    <TabbedWorkspacePage
                      activeTab={activeTab || "repositories"}
                      description="Developer tooling for inspecting and maintaining Athena itself."
                      onTabChange={(tab) => selectTab("/engineering", tab)}
                      tabs={engineeringTabs}
                      title="Engineering"
                    />
                  ) : null}
                </main>

                <footer className="telemetry-bar" aria-label="System telemetry">
                  <span>
                    <Activity size={14} />
                    API nominal
                  </span>
                  <span>
                    <Bot size={14} />
                    Agent registry online
                  </span>
                  <span>
                    <Workflow size={14} />
                    Workflow queue idle
                  </span>
                  <span>
                    <Shield size={14} />
                    Security controls active
                  </span>
                  <span>
                    <MemoryStick size={14} />
                    UI 60fps target
                  </span>
                </footer>
              </div>
            </>
          ) : null}
        </PersistentVoiceRuntimeProvider>
      </PersistentSpatialRuntimeProvider>
    </SpatialFrameworkProvider>
  );
};
