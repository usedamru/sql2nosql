git# Damru — sql2nosql docs

Documentation site for **sql2nosql** (Damru). Built with VitePress; content lives in repo root `content/`.

## Develop

From repo root:

```bash
yarn docs:dev
```

Or from this folder:

```bash
yarn install
yarn dev
```

Opens at `http://localhost:5173`.

## Build

```bash
yarn docs:build
```

Output: `docs-site/.vitepress/dist`.

## Deploy (GitHub Pages)

The workflow `.github/workflows/deploy-docs.yml` builds and deploys on every push to `main`.

**One-time setup:** Repo → **Settings** → **Pages** → **Source**: **GitHub Actions**.

Live site: **https://usedamru.github.io/sql2nosql/** (Damru / usedamru org).

## Content

Edit **repo root `content/*.md`** only. The site uses `srcDir: '../content'`—no duplication.
