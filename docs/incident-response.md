# Incident response

For every incident: activate emergency stop, preserve UTC logs/audit IDs,
contain network reachability, revoke affected sessions/devices, rotate exposed
credentials, restore only from verified state, then validate `/ready`, signed
request replay rejection, policy denial, and execution unavailability.

| Scenario                              | Contain and recover                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost phone or stolen browser session  | Remove the controller from the tailnet, revoke its sessions from a retained owner session, rotate the password if exposure is plausible, and review audit/network failures. |
| Lost Mac or revoked agent key         | Revoke the registered device, remove it from the tailnet, cancel related pending approvals, reset only the assistant key on recovered hardware, and pair a new identity.    |
| Tailscale account compromise          | Disable Serve, remove suspect nodes/keys, rotate Tailscale credentials, review grants and posture, then re-enable only after reachability tests show no public path.        |
| Database credential leak              | Revoke/rotate the database role, restrict network access, inspect database/audit access, deploy the new secret, and confirm migrations/readiness.                           |
| Session-token leak                    | Revoke the session or all other sessions, rotate the password when warranted, and confirm CSRF/recent-auth grants are invalid.                                              |
| Recovery-code leak                    | Invalidate all codes, complete recent authentication, generate a replacement set, and store it in a password manager.                                                       |
| Repeated signature or replay failures | Revoke the device if unexplained, preserve request/device IDs, inspect clock and key integrity, and require re-pairing.                                                     |
| Unexpected public-network request     | Stop Serve/backend, verify loopback bind, proxy trust, grants, firewall, and that public exposure is disabled before restart.                                               |
| Keychain failure                      | Do not generate a silent replacement. Mark identity unavailable, repair Keychain, or explicitly reset and re-pair.                                                          |
| Corrupt database or failed migration  | Stop writes, snapshot evidence, restore to an isolated instance, review migration SQL, and resume only after integrity and readiness tests.                                 |
| Emergency-stop failure                | Stop the API process and Serve endpoint, preserve evidence, repair persistent security state, and validate default-active behavior before service resumes.                  |
| Dependency compromise                 | Pin/remove the package, preserve lockfile and build evidence, rotate reachable secrets, rebuild from a clean environment, and review audit findings.                        |

Accidental public exposure is an immediate containment event: remove the
exposure configuration, run `tailscale serve reset` only after checking the
installed CLI help, stop the backend, review access logs, and rotate potentially
exposed session/database credentials.

For suspicious execution, assert emergency stop, revoke the device, preserve
request/result/audit records, stop agent polling, rotate the server key if its
host may be compromised, and validate registered roots before resuming.
