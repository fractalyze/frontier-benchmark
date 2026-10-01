# Agent notes

Read [README.md](README.md) first and follow its "Read first" table; the docs
there are the source of truth. The skill
`.agents/skills/frontier-benchmark-recipes/SKILL.md` covers adding a recipe or
a model.

## Always

- Shell: `source ~/.nvm/nvm.sh && nvm use 22` before any npm command (system
  node is 18). npm is the only package manager; `package-lock.json` is the only
  lockfile.
- Checks before a PR: `npm test`, `npx eslint .`, `npm run build`; pytest
  (`/data/a41/frontier-venv/bin/python -m pytest -q`) when `bench/` changes.
- UI changes: screenshot the dev server with headless Chromium before shipping;
  SSR HTML alone hides layout problems.
- Data: a recipe with placeholder metrics fails `npm test` and must never be
  committed or deployed. The loader names the bad file.
- GPU: the harness takes a lock and refuses when it is held; never break a live
  lock. Long jobs go in a background script that polls the lock every 2 s.
- Never `pkill -f` / `pgrep -f` a pattern that also appears in your own command
  line (use `name[.]sh`); killing the shell mid-command has happened.
- Commits: `type: summary`, no scope in parentheses. Branch, PR, merge commit,
  then deploy from `main` with the Vercel CLI (`docs/deploy.md`). Never push to
  `main` directly.
