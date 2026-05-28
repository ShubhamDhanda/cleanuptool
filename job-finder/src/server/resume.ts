import type { ResumeProfile } from "../shared/types";

const DEFAULT_TARGET_LOCATIONS = [
  "Hyderabad",
  "Bengaluru",
  "Bangalore",
  "NCR",
  "Gurgaon",
  "Gurugram",
  "Noida",
  "Delhi",
  "Remote",
  "India"
];

export function latexToText(latex: string): string {
  return latex
    .replace(/%.*$/gm, "")
    .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, "$2")
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\small\{([^}]*)\}/g, "$1")
    .replace(/\\footnotesize\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, " ")
    .replace(/[{}$]/g, " ")
    .replace(/\\\\/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractCommand(latex: string, command: string): string | null {
  const match = latex.match(new RegExp(`\\\\newcommand\\{\\\\${command}\\}\\{([^}]*)\\}`));
  return match?.[1]?.trim() ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function pickSkills(text: string, candidates: string[]): string[] {
  const lower = text.toLowerCase();
  return candidates.filter((skill) => lower.includes(skill.toLowerCase()));
}

export function parseResumeLatex(rawLatex: string): ResumeProfile {
  const text = latexToText(rawLatex);
  const name = extractCommand(rawLatex, "name") ?? "Shubham Dhanda";

  const coreSkills = unique([
    ...pickSkills(text, [
      "Golang",
      "Go",
      "gRPC",
      "JSON-RPC",
      "RPC",
      "Microservices",
      "REST APIs",
      "Distributed Systems",
      "Platform Engineering",
      "Developer Tooling",
      "API Design"
    ])
  ]);

  const infraSkills = unique([
    ...pickSkills(text, [
      "Docker",
      "Kubernetes",
      "Helm",
      "GitHub Actions",
      "CI/CD",
      "AWS",
      "Oracle Cloud",
      "Redis",
      "PostgreSQL"
    ])
  ]);

  const languages = unique([
    ...pickSkills(text, ["Go", "JavaScript", "Node.js", "C++", "SQL", "Python"])
  ]);

  const concepts = unique([
    ...pickSkills(text, [
      "System Design",
      "Low-Level Design",
      "Distributed Systems",
      "RPC Architecture",
      "Developer Infrastructure",
      "Microservices"
    ])
  ]);

  return {
    name,
    headline: "Backend Platform Engineer",
    location: "Hyderabad, India",
    yearsExperience: 2,
    currentCompLpa: 28,
    targetCompLpa: 40,
    targetLocations: DEFAULT_TARGET_LOCATIONS,
    primaryRoles: [
      "Backend Engineer",
      "Software Development Engineer",
      "Software Engineer",
      "Platform Engineer",
      "Infrastructure Engineer",
      "Developer Tools Engineer"
    ],
    coreSkills: unique(coreSkills.length ? coreSkills : ["Go", "gRPC", "Microservices", "Platform Engineering"]),
    infraSkills: unique(infraSkills),
    languages: unique(languages.length ? languages : ["Go", "JavaScript", "C++", "SQL"]),
    concepts: unique(concepts),
    rawLatex,
    summary: text.slice(0, 2500)
  };
}
