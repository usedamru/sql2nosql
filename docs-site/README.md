# sql2nosql docs

Documentation site (VitePress). The readable docs live here.

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

The workflow `.github/workflows/deploy-docs.yml` builds the docs-site and deploys to GitHub Pages on every push to `main`. Enable it once:

1. Repo **Settings** → **Pages** → **Build and deployment**: Source = **GitHub Actions**.
2. After the next push to `main`, docs will be at `https://<owner>.github.io/<repo>/`.

## Content (single source)

Markdown lives in **repo root `content/`** only. The docs site is configured with `srcDir: '../content'`, so it reads from that folder. Edit `content/*.md` at the repo root to update both the reference docs and the site—no duplication.
