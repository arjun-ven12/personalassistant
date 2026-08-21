export const SECURITY_INVARIANTS = {
  denyByDefault: true,
  arbitraryShellAllowed: false,
  arbitraryFileAccessAllowed: false,
  permanentDeletionAllowed: false,
  highRiskGestureApprovalAllowed: false,
} as const;

export const BLOCKED_WORKSPACE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  ".ssh/",
  ".aws/",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "service-account*.json",
  "Library/Keychains/",
  "Library/Application Support/*password*",
] as const;
