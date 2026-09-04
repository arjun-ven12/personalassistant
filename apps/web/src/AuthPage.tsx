import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { ApiClientError, type ApiClient } from "./api.js";

export const AuthPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  const authenticate = useMutation({
    mutationFn: async (form: FormData) => {
      const emailValue = form.get("email");
      const passwordValue = form.get("password");
      const displayNameValue = form.get("displayName");
      const email = typeof emailValue === "string" ? emailValue : "";
      const password = typeof passwordValue === "string" ? passwordValue : "";
      return mode === "login"
        ? apiClient.login({ email, password })
        : apiClient.register({
            email,
            password,
            displayName: typeof displayNameValue === "string" ? displayNameValue : "",
          });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["auth-session"] });
    },
    onError: (reason) => {
      setError(
        reason instanceof ApiClientError
          ? reason.message
          : "Authentication could not be completed.",
      );
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    authenticate.mutate(new FormData(event.currentTarget));
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div>
          <p className="product-kicker">Private owner console</p>
          <span className="product-name">Athena Control</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Phase 2.1 identity boundary</p>
          <h1 id="auth-heading">
            {mode === "login" ? "Owner sign in" : "Create the initial owner"}
          </h1>
          <p>
            Authentication establishes identity only. Application, file, terminal,
            browser, AI, and operating-system control remain unavailable.
          </p>
        </div>
        <form onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Display name
              <input autoComplete="name" name="displayName" required type="text" />
            </label>
          ) : null}
          <label>
            Email
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 12 : undefined}
              name="password"
              required
              type="password"
            />
          </label>
          {mode === "register" ? (
            <p className="field-help">
              Use at least 12 characters with uppercase, lowercase, number, and symbol.
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button disabled={authenticate.isPending} type="submit">
            {authenticate.isPending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create owner"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setError(null);
            setMode(mode === "login" ? "register" : "login");
          }}
          type="button"
        >
          {mode === "login"
            ? "First run? Create the owner account"
            : "Already registered? Sign in"}
        </button>
        <div className="notice" role="note">
          Sessions use an HttpOnly, SameSite=Strict cookie. Google OAuth remains
          structure-only and makes no external request.
        </div>
      </section>
    </main>
  );
};
