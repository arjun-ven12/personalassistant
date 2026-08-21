# Local AI Security

Local output is untrusted. Models cannot call tools, launch applications, run
shell or AppleScript, approve work, register capabilities, or write to native
providers. Retrieved memories and context are bounded data, not instructions.
Prompts and completions are not persisted by the runtime; audit metadata records
only model, role, mode, sizes, status, and latency.
