# Hanoi Local Zone Field Notes

Static Astro publication built from the verified architecture, benchmark evidence, and engineering findings in the parent repository.

The flagship analysis is available in both English and Vietnamese:

- `/insights/what-1200-requests-taught-us/`
- `/insights/aws-hanoi-local-zone-1200-requests-3-kien-truc/`

The Vietnamese article includes dated links to official AWS service-availability and product documentation. Both versions clearly label AWS_REAL as historical and `NOT_DEPLOYED`.

## Local development

```powershell
cd blog
npm ci
npm run dev
```

Open `http://localhost:4321`.

## Validation

```powershell
cd blog
npm run build
```

The build reads `../evidence/aws-real-benchmark-latest.json` and derives chart data from the retained historical AWS_REAL samples. It does not contact AWS.

## GitHub Pages

The repository workflow at `.github/workflows/blog-pages.yml` builds this directory and deploys `blog/dist`. In GitHub, select **Settings → Pages → Source → GitHub Actions**.

The Astro `site` and `base` values are derived from `GITHUB_REPOSITORY`, so project Pages paths work without hardcoding a fork owner's name.
