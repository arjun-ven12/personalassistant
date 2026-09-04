import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface WorkspaceTab {
  id: string;
  label: string;
  content: ReactNode;
  advanced?: boolean;
}

export const TabbedWorkspacePage = ({
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  description: string;
  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!selected) return null;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    event.preventDefault();
    onTabChange(nextTab.id);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  };

  return (
    <section className="tabbed-workspace" aria-labelledby="workspace-title">
      <header className="tabbed-workspace-header">
        <div>
          <p className="eyebrow">Athena workspace</p>
          <h2 id="workspace-title">{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div
        aria-label={`${title} sections`}
        aria-orientation="horizontal"
        className="workspace-tabs"
        role="tablist"
      >
        {tabs.map((tab, index) => (
          <button
            aria-controls={`${title}-${tab.id}`}
            aria-selected={selected.id === tab.id}
            className={selected.id === tab.id ? "active" : undefined}
            id={`${title}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={selected.id === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
            {tab.advanced ? <small>Advanced</small> : null}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${title}-${selected.id}-tab`}
        id={`${title}-${selected.id}`}
        role="tabpanel"
      >
        {selected.content}
      </div>
    </section>
  );
};
