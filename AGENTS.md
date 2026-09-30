# Agent notes

- Package manager: npm on Node 22 (`package-lock.json` is the only lockfile).
- Tests run with `npm test` (vitest).
- Always prefix shell work with `source ~/.nvm/nvm.sh && nvm use 22` — system node is v18 and Vite 8 fails on it.
- Data lives in `data/benchmarks/<model>/<hw>/{benchmark.json,recipes/*.json}`; `configs/` there holds recipe configs the loader ignores. A bad data file fails `npm test` with the file named.
- Before shipping UI, screenshot the dev server (Playwright + headless Chromium) — SSR HTML alone hides layout problems.
