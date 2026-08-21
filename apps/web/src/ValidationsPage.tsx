import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { ValidationProfileId } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

const terminal = new Set(["PASSED", "PASSED_WITH_WARNINGS", "FAILED", "CANCELLED"]);

export const ValidationsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [repositoryId, setRepositoryId] = useState("");
  const [selectedProfiles, setSelectedProfiles] = useState<ValidationProfileId[]>([
    "pnpm_format_check",
    "pnpm_typecheck",
    "pnpm_lint",
    "pnpm_test",
    "pnpm_build",
  ]);
  const repositories = useQuery({
    queryKey: ["repositories"],
    queryFn: apiClient.getRepositories,
  });
  const profiles = useQuery({
    queryKey: ["validation-profiles"],
    queryFn: apiClient.getValidationProfiles,
  });
  const validations = useQuery({
    queryKey: ["validations"],
    queryFn: apiClient.getValidations,
    refetchInterval: (query) =>
      query.state.data?.some((run) => !terminal.has(run.status)) ? 2_000 : false,
  });
  const create = useMutation({
    mutationFn: () =>
      apiClient.createValidation({
        repositoryId,
        profileIds: selectedProfiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["validations"] });
    },
  });
  const start = useMutation({
    mutationFn: apiClient.startValidation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["validations"] });
    },
  });
  const cancel = useMutation({
    mutationFn: apiClient.cancelValidation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["validations"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (repositoryId && selectedProfiles.length > 0) create.mutate();
  };
  const toggleProfile = (profileId: ValidationProfileId) => {
    setSelectedProfiles((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  };
  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 5.2</p>
      <h1>Verified code validation</h1>
      <p>
        Plan and run immutable validation profiles through the trusted Mac agent. No
        arbitrary commands or shell access are exposed.
      </p>

      <form className="policy-form" onSubmit={submit}>
        <label>
          Repository
          <select
            required
            value={repositoryId}
            onChange={(event) => setRepositoryId(event.target.value)}
          >
            <option value="">Select repository</option>
            {repositories.data?.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.workspaceId} · {repository.indexStatus}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Execution profiles</legend>
          <div className="checkbox-grid">
            {profiles.data?.map((profile) => (
              <label key={profile.id}>
                <input
                  checked={selectedProfiles.includes(profile.id)}
                  type="checkbox"
                  onChange={() => toggleProfile(profile.id)}
                />
                {profile.label}
                <small>{profile.commandDisplay}</small>
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={create.isPending} type="submit">
          Create validation plan
        </button>
      </form>

      <section className="panel-list">
        <h2>Validation history</h2>
        {validations.data?.map((validation) => (
          <article className="panel" key={validation.id}>
            <p className="eyebrow">{validation.status}</p>
            <h3>{validation.classification ?? "Awaiting execution"}</h3>
            <p>{validation.planSummary}</p>
            {validation.summary ? <p>{validation.summary}</p> : null}
            <div className="button-row">
              <button
                disabled={
                  validation.status !== "PLANNED" || start.isPending || !repositoryId
                }
                onClick={() => start.mutate(validation.id)}
                type="button"
              >
                Start execution
              </button>
              <button
                disabled={
                  !["EXECUTION_REQUESTED", "RUNNING"].includes(validation.status) ||
                  cancel.isPending
                }
                onClick={() => cancel.mutate(validation.id)}
                type="button"
              >
                Cancel
              </button>
            </div>
            {validation.steps.map((step) => (
              <details key={step.stepId}>
                <summary>
                  {step.profileId}: {step.status}
                </summary>
                <p>
                  Exit {step.exitCode ?? "n/a"} · {step.durationMs ?? 0}ms ·{" "}
                  {step.classification ?? "unclassified"}
                </p>
                {step.stdout ? <pre>{step.stdout}</pre> : null}
                {step.stderr ? <pre>{step.stderr}</pre> : null}
              </details>
            ))}
          </article>
        ))}
      </section>
    </section>
  );
};
