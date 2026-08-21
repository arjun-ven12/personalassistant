# Git inspection

The agent uses fixed `/usr/bin/git`; requests cannot supply executable,
arguments, revision, pathspec, environment, or cwd. `shell` is false and stdin
is ignored.

```text
-c color.ui=false -c core.pager=cat status --porcelain=v2 --branch --untracked-files=all
-c color.ui=false -c core.pager=cat branch --show-current
-c color.ui=false diff --no-ext-diff --stat
-c color.ui=false diff --cached --no-ext-diff --stat
-c color.ui=false diff --no-ext-diff --name-status
-c color.ui=false diff --cached --no-ext-diff --name-status
```

The cwd is the canonical registered workspace. The environment is rebuilt with
a fixed `PATH`, empty `HOME`, `LC_ALL=C`, disabled credential prompts and
optional locks, null global/system config, and `cat` pagers. External diffs,
aliases, injected repositories, SSH helpers, and inherited loader variables
are unavailable.

Only structured status, branch, diff-stat, and name-status results are
returned. Status includes bounded per-kind counts, and stat-mode diffs include
structured total files, insertions, and deletions when Git reports them. Full
patches are not returned. Operations have three- or five-second timeouts and
byte/entry caps. No Git mutation handler exists.
