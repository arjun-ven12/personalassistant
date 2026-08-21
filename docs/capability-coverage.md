# Capability Coverage

Current Phase 17H native provider coverage:

| Provider | Implemented                                           | Fails closed                                                                                                                  |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| VS Code  | `launch`, `focus`                                     | repository/workspace/file opening, Explorer/Search/Terminal focus, command palette, Problems, Extensions, tab switching, save |
| Finder   | `launch`, `focus`, `focus_downloads`, `focus_desktop` | arbitrary folder/file paths, search, new folder, sidebar focus                                                                |
| Chrome   | `launch`, `focus`, `open_url` for HTTP(S) URLs        | tab manipulation, reload, find, bookmark                                                                                      |
| Safari   | `launch`, `focus`, `open_url` for HTTP(S) URLs        | tab manipulation, reload, find                                                                                                |
| Terminal | `launch`, `focus`                                     | approved command entry, interrupt, clear, profile/session focus                                                               |

Provider execution uses fixed native operations only. Unsupported capabilities
return structured failures and do not use fallback keyboard, mouse, shell,
AppleScript, OCR, or coordinate automation.
