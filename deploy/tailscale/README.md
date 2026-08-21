# Tailscale Serve deployment

This directory is an operator guide and does not modify a Tailscale account.
Install Tailscale, sign in, enable MagicDNS and tailnet HTTPS, and review the
installed CLI before applying examples:

```text
tailscale version
tailscale serve --help
tailscale serve status
```

Run the API on `127.0.0.1:3001`, then use the syntax supported by that installed
version to proxy the private HTTPS root to `http://127.0.0.1:3001`. A current
example is:

```text
tailscale serve --bg http://127.0.0.1:3001
tailscale serve status
```

Confirm the `https://HOST.TAILNET.ts.net/` dashboard and `/api/` work from an
approved controller, fail from an unapproved tailnet identity, and are
unreachable off-tailnet. Confirm no public exposure is enabled in the admin
console and local status. To roll back, first inspect `tailscale serve --help`,
then use:

```text
tailscale serve reset
```

Review and replace all placeholders in `grants.example.hujson`; it is not
installed automatically. Tagged nodes are non-user devices. Keep ordinary
personal controller devices user-owned, restrict controllers and Mac agents to
TCP 443 on the assistant server, and do not permit server-initiated broad access.

Optional posture can require supported OS/version, disk encryption, screen
lock, current Tailscale client, ownership, and configured security software.
Availability depends on the tailnet configuration. Posture is an additional
connectivity gate, never application authentication.
