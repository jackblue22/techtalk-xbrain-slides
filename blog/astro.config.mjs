import { defineConfig } from "astro/config";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "techtalk-xbrain-slides";
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "jackblue22";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  site: isGitHubPages ? `https://${owner}.github.io` : "http://localhost:4321",
  base: isGitHubPages ? `/${repository}/` : "/",
  output: "static",
  build: {
    format: "directory"
  },
  vite: {
    build: {
      cssMinify: "lightningcss"
    }
  }
});
