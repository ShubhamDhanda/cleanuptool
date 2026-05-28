import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Job, JobPriority, JobScore, ResumeProfile } from "../shared/types";
import { companyQualityScore, estimateSalary } from "./enrichment";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function includesAny(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function freshnessScore(postedAt?: string | null): number {
  if (!postedAt) return 55;
  const days = differenceInCalendarDays(new Date(), parseISO(postedAt));
  if (days <= 1) return 100;
  if (days <= 2) return 90;
  if (days <= 7) return 72;
  if (days <= 14) return 45;
  return 25;
}

function locationScore(location: string, profile: ResumeProfile): number {
  if (!location) return 55;
  const lower = location.toLowerCase();
  const matched = profile.targetLocations.some((target) => lower.includes(target.toLowerCase()));
  return matched ? 100 : 35;
}

function compensationScore(expectedLpa: number | null, targetLpa: number, currentLpa: number): number {
  if (!expectedLpa) return 45;
  if (expectedLpa >= targetLpa + 15) return 100;
  if (expectedLpa >= targetLpa) return 88;
  if (expectedLpa >= currentLpa) return 62;
  return 25;
}

function priorityFromScore(score: number, compScore: number): JobPriority {
  if (score >= 80 && compScore >= 62) return "Apply Today";
  if (score >= 70 && compScore >= 55) return "Worth Referral";
  if (score >= 55) return "Maybe";
  return "Skip";
}

export function scoreJob(job: Job, profile: ResumeProfile): JobScore {
  const searchText = [
    job.title,
    job.company,
    job.location,
    job.description,
    job.salaryText,
    job.seniority,
    ...(job.skills ?? [])
  ]
    .filter(Boolean)
    .join(" ");

  const strongSignals = includesAny(searchText, [
    "go",
    "golang",
    "grpc",
    "rpc",
    "microservice",
    "platform",
    "developer tooling",
    "infrastructure",
    "distributed",
    "kubernetes",
    "helm",
    "backend",
    "api"
  ]);

  const roleSignals = includesAny(searchText, [
    "software engineer",
    "sde",
    "backend",
    "platform engineer",
    "infrastructure engineer",
    "developer tools"
  ]);

  const negativeSignals = includesAny(searchText, [
    "support engineer",
    "qa engineer",
    "manual testing",
    "wordpress",
    "php developer",
    "internship",
    "freshers",
    "0 years"
  ]);

  const salaryEstimate = estimateSalary(job.company, job.title, job.salaryText);
  const comp = compensationScore(
    salaryEstimate.expectedLpa,
    profile.targetCompLpa,
    profile.currentCompLpa
  );
  const company = companyQualityScore(job.company);
  const fresh = freshnessScore(job.postedAt);
  const loc = locationScore(job.location, profile);

  const fitBase = strongSignals.length * 8 + roleSignals.length * 7 - negativeSignals.length * 18;
  const fitScore = clamp(35 + fitBase);
  const finalScore = clamp(
    fitScore * 0.35 + comp * 0.25 + company.score * 0.2 + fresh * 0.15 + loc * 0.05
  );

  const concerns: string[] = [];
  if (negativeSignals.length) concerns.push(`Weak role match: ${negativeSignals.join(", ")}`);
  if ((salaryEstimate.expectedLpa ?? 0) < profile.currentCompLpa) {
    concerns.push("Likely compensation downgrade versus current 28L.");
  }
  if (loc < 60) concerns.push("Location is outside Hyderabad/Bengaluru/NCR/India-remote preference.");
  if (!strongSignals.some((signal) => /go|golang|rpc|platform|backend/i.test(signal))) {
    concerns.push("Does not strongly mention Go/RPC/backend platform signals.");
  }

  const resumeSuggestions: string[] = [];
  if (/kubernetes|helm/i.test(searchText) && !/kubernetes/i.test(profile.summary)) {
    resumeSuggestions.push("Add clearer Kubernetes/Helm ownership bullets before applying.");
  }
  if (/distributed|scale|high throughput/i.test(searchText)) {
    resumeSuggestions.push("Emphasize MITO as distributed developer infrastructure with org-wide adoption.");
  }
  if (/sde\s*2|senior/i.test(searchText)) {
    resumeSuggestions.push("Tailor summary toward SDE-2 readiness: ownership, architecture, impact, mentorship.");
  }
  if (!resumeSuggestions.length) {
    resumeSuggestions.push("Current resume narrative already fits; tailor only title keywords before applying.");
  }

  const priority = priorityFromScore(finalScore, comp);

  return {
    fitScore,
    compensationScore: comp,
    freshnessScore: fresh,
    companyScore: company.score,
    locationScore: loc,
    finalScore,
    priority,
    salaryEstimate,
    matchSignals: [...strongSignals, ...roleSignals].slice(0, 12),
    concerns,
    resumeSuggestions,
    reasoning: `${company.tier} company signal, ${salaryEstimate.source} salary estimate, ${fresh}/100 freshness, ${loc}/100 location fit.`,
    scoredAt: new Date().toISOString()
  };
}

export function scoreJobs(jobs: Job[], profile: ResumeProfile): JobScore[] {
  return jobs.map((job) => scoreJob(job, profile));
}
