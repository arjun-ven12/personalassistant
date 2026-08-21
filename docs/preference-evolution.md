# Preference Evolution

Stable preferences are stored separately from raw evidence and candidates.
Manual locked owner preferences outrank learned preferences. Existing locked or
manual preferences are not replaced by statistical learning.

When a new preference supersedes an old one, the old record is retained with an
end timestamp and `SUPERSEDED` status. This preserves history and supports
future rollback/inspection.
