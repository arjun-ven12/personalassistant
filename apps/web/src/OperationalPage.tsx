import type { ReactNode } from "react";

export const OperationalPage = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="operational-page" aria-labelledby={`${title}-page-title`}>
    <header className="operational-page-header">
      <div>
        <h1 id={`${title}-page-title`}>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
    <div className="operational-page-body">{children}</div>
  </section>
);
