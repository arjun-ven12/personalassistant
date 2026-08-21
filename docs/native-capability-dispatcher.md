# Native Capability Dispatcher

The Native Capability Dispatcher is the only backend path that may ask a native
provider to perform a macOS-affecting semantic capability.

Dispatch validates:

- provider exists;
- provider is registered for the requested trusted application;
- capability is declared and enabled;
- application is explicitly trusted;
- required adapter permissions are granted;
- terminal commands reference an enabled approved command record;
- provider health is `healthy`.

If any check fails, a structured denied execution record is stored and no macOS
action is performed.

The dispatcher must not synthesize a successful provider result. A successful
provider execution record requires a real reviewed provider-host execution
result. Until the backend has a signed transport to the Mac Agent provider host,
otherwise valid dispatch requests fail closed with a structured unavailable
transport error.
