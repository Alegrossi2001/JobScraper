export const SETTINGS = {
  city: "poznan",

  // JustJoin marker_icon values + NoFluffJobs category slugs
  categories: [
    "javascript", "typescript", "python", "java", "devops",
    "backend", "fullstack", "react", "nodejs", "go",
  ],

  // Minimum monthly gross salary in PLN (B2B or UoP)
  minSalary: 12_000,

  // Extra keyword signals — used for scoring/filtering but not hard exclusion
  keywords: [
    "react", "docker", "mcp", "agentic workflow",
    "nodejs", "microservices", "kubernetes", "typescript",
  ],

  experience: ["junior", "mid", "senior"],
} as const;

export type SettingsCategories = typeof SETTINGS.categories[number];
