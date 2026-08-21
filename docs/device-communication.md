# Device Communication

The Mac Agent communicates with the backend through the existing signed
`/api/agent/execution` route.

The poll payload may include bounded provider-host diagnostics:

- host availability;
- provider implementation coverage;
- native bridge status;
- Accessibility trust status;
- raw automation flags, all fixed to unavailable.

The backend uses those diagnostics to update provider health and validation.
Diagnostics do not grant permission by themselves; dispatch still validates
trusted application state, declared capability, provider health, adapter
permissions, policy, and audit context.
