# Agent notes

Read [README.md](README.md) first and follow its "Docs" table; the docs
there are the source of truth. The skill
`.agents/skills/frontier-benchmark-recipes/SKILL.md` covers adding a recipe or
a model.

## Always

- Shell: `source ~/.nvm/nvm.sh && nvm use 22` before any npm command (system
  node is 18). npm is the only package manager; `package-lock.json` is the only
  lockfile.
- Checks before a PR: `npm test`, `npx eslint .`, `npm run build`; pytest
  (`python -m pytest -q`, harness venv) when `bench/` changes.
- UI changes: screenshot the dev server with headless Chromium before shipping;
  SSR HTML alone hides layout problems. Playwright is not a dependency of this
  repo: use a global install (or `npx playwright`) and its own browser cache.
- Data: a recipe with placeholder metrics fails `npm test` and must never be
  committed or deployed. The loader names the bad file.
- GPU: the harness takes a lock (`BENCH_GPU_LOCKS`) and refuses when it is
  held; never break a live lock. Long jobs go in a background script that polls
  the lock every 2 s.
- Docs and the skill never contain machine-specific absolute paths; use env
  vars (`BENCH_HELDOUT`, `BENCH_RUNS`, `HF_HOME`, …) or repo-relative paths.
- Never `pkill -f` / `pgrep -f` a pattern that also appears in your own command
  line (use `name[.]sh`); killing the shell mid-command has happened.
- Commits: `type: summary`, no scope in parentheses. Branch, PR, merge commit,
  then deploy from `main` with the Vercel CLI (`docs/deploy.md`). Never push to
  `main` directly.
