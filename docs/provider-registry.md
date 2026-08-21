# Provider Registry

The Provider Registry contains reviewed native provider descriptors such as
VSCodeProvider, FinderProvider, TerminalProvider, ChromeProvider, and
SafariProvider.

Each provider declares:

- identity;
- application ID and bundle identifier;
- provider type and version;
- supported macOS versions;
- finite capabilities;
- required permissions;
- verification expectations;
- sandbox posture.

Future providers must be pluggable through registry records and must not require
core runtime redesign.
