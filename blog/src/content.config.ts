import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    eyebrow: z.string(),
    readingTime: z.string(),
    tags: z.array(z.string()),
    featured: z.boolean().default(false),
    lang: z.enum(["en", "vi"]).default("en"),
    translationSlug: z.string().optional()
  })
});

export const collections = { articles };
