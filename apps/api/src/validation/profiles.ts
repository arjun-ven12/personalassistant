import { ValidationProfileSchema, type ValidationProfile } from "@alexa-control/shared";

export const VALIDATION_PROFILES: ValidationProfile[] = [
  {
    id: "pnpm_format_check",
    label: "Prettier format check",
    category: "format",
    commandDisplay: "pnpm format:check",
    timeoutMs: 60_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_typecheck",
    label: "TypeScript type check",
    category: "typecheck",
    commandDisplay: "pnpm typecheck",
    timeoutMs: 90_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_lint",
    label: "ESLint",
    category: "lint",
    commandDisplay: "pnpm lint",
    timeoutMs: 90_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_test",
    label: "Vitest test suite",
    category: "test",
    commandDisplay: "pnpm test",
    timeoutMs: 120_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_build",
    label: "Production build",
    category: "build",
    commandDisplay: "pnpm build",
    timeoutMs: 120_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_security_check",
    label: "Security checks",
    category: "security",
    commandDisplay: "pnpm security:check",
    timeoutMs: 120_000,
    network: "disabled",
    immutable: true,
  },
  {
    id: "pnpm_verify_production_config",
    label: "Production config validation",
    category: "security",
    commandDisplay: "pnpm verify:production-config",
    timeoutMs: 60_000,
    network: "disabled",
    immutable: true,
  },
].map((profile) => ValidationProfileSchema.parse(profile));

export const getValidationProfiles = () => VALIDATION_PROFILES;

export const requireValidationProfiles = (ids: string[]) =>
  ids.map((id) => {
    const profile = VALIDATION_PROFILES.find((candidate) => candidate.id === id);
    if (!profile) throw new Error(`Unknown validation profile: ${id}`);
    return profile;
  });
