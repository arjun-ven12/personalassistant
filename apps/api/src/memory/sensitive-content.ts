// Fail closed before memory is persisted or included in model context. This is
// deliberately conservative: a false positive omits context, while a false
// negative could disclose a credential to a model provider.
const credentialPattern =
  /\b(?:password|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|secret|session[ _-]?cookie|recovery[ _-]?code|one[ _-]?time(?:[ _-]?password|[ _-]?code)|otp)\b|(?:sk-|ghp_|akia)[a-z0-9_-]{8,}/i;

export const hasSensitiveMemoryContent = (...values: string[]) =>
  values.some((value) => credentialPattern.test(value));
