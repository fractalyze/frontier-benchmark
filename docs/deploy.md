# Deploying

Scope: how a merged `main` reaches production, and what protects it.
Status: current · updated 2026-10-01.

The site is a TanStack Start app deployed to Vercel, project
`fractalyze/frontier`, production URL https://frontier-fractalyze.vercel.app.

Deploys run from the Vercel CLI (`npm i -g vercel`, logged in to the team),
not from Git: the team's GitHub integration cannot see this repository.

## Preview or production

```bash
git checkout main && git pull --ff-only          # from the repo root
DST=$(mktemp -d)/deploy
mkdir -p "$DST"
rsync -a --exclude node_modules --exclude .git --exclude .output --exclude .nitro \
  --exclude .tanstack --exclude dist --exclude .vercel ./ "$DST/"
mkdir -p "$DST/.vercel" && cp .vercel/project.json "$DST/.vercel/"
cd "$DST" && source ~/.nvm/nvm.sh && nvm use 22
vercel deploy --scope fractalyze --yes          # preview
vercel deploy --prod --scope fractalyze --yes   # production
```

Deploy from a copy so the working tree's untracked files (placeholder recipes,
scratch output) never ship. Vercel builds remotely; `npm run build` locally is
the pre-flight.

## Release flow

1. Branch from `main`, commit (`type: summary`, no scope in parentheses).
2. `npm test`, `npx eslint .`, `npm run build`, pytest if `bench/` changed;
   screenshot any UI change.
3. Open a PR, merge with a merge commit, fast-forward local `main`.
4. Deploy production from `main`.

## Deployment protection

Vercel Authentication is **on** for the project, so every URL (including
`og.png`) redirects to a Vercel login for people outside the team. Turn it off
in the project's Deployment Protection settings, or add a custom domain, to
make the site public.

## Metadata

`src/routes/__root.tsx` sets the favicon (`public/favicon.svg|ico`,
`apple-touch-icon.png`; all three are rendered from the one SVG, a Pareto step
line), the Open Graph card (`public/og.png`, 1200×630) and `SITE_URL` from
`src/data/site.ts`.
