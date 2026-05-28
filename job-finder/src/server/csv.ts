import type { DashboardJob } from "../shared/types";

function cell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function jobsToCsv(jobs: DashboardJob[]): string {
  const headers = [
    "Priority",
    "Score",
    "Company",
    "Title",
    "Location",
    "Salary Estimate",
    "Salary Confidence",
    "Source",
    "Status",
    "Posted At",
    "Match Signals",
    "Concerns",
    "Resume Suggestions",
    "Link"
  ];

  const rows = jobs.map((job) => [
    job.score?.priority ?? "",
    job.score?.finalScore ?? "",
    job.company,
    job.title,
    job.location,
    job.score?.salaryEstimate.expectedLpa ? `${job.score.salaryEstimate.expectedLpa} LPA` : "",
    job.score?.salaryEstimate.confidence ?? "",
    job.source,
    job.applicationStatus,
    job.postedAt ?? "",
    job.score?.matchSignals ?? [],
    job.score?.concerns ?? [],
    job.score?.resumeSuggestions ?? [],
    job.link
  ]);

  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}
