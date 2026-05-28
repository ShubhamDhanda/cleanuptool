export type JobSource = "instahyre" | "naukri" | "linkedin" | "manual" | "fixture";

export type JobPriority = "Apply Today" | "Worth Referral" | "Maybe" | "Skip";

export type ApplicationStatus =
  | "new"
  | "shortlisted"
  | "applied"
  | "rejected"
  | "archived";

export type SalaryEstimate = {
  minLpa: number | null;
  maxLpa: number | null;
  expectedLpa: number | null;
  confidence: "high" | "medium" | "low" | "unknown";
  source: string;
};

export type ResumeProfile = {
  id?: number;
  name: string;
  headline: string;
  location: string;
  yearsExperience: number;
  currentCompLpa: number;
  targetCompLpa: number;
  targetLocations: string[];
  primaryRoles: string[];
  coreSkills: string[];
  infraSkills: string[];
  languages: string[];
  concepts: string[];
  rawLatex: string;
  summary: string;
};

export type Job = {
  id?: number;
  source: JobSource;
  externalId?: string | null;
  title: string;
  company: string;
  location: string;
  postedAt?: string | null;
  collectedAt?: string;
  link: string;
  description?: string;
  salaryText?: string;
  seniority?: string;
  skills?: string[];
};

export type JobScore = {
  id?: number;
  jobId?: number;
  fitScore: number;
  compensationScore: number;
  freshnessScore: number;
  companyScore: number;
  locationScore: number;
  finalScore: number;
  priority: JobPriority;
  salaryEstimate: SalaryEstimate;
  matchSignals: string[];
  concerns: string[];
  resumeSuggestions: string[];
  reasoning: string;
  scoredAt?: string;
};

export type DashboardJob = Job & {
  applicationStatus: ApplicationStatus;
  notes: string;
  appliedAt: string | null;
  resumeVariant: string;
  score: JobScore | null;
};

export type DashboardFilters = {
  source?: JobSource | "all";
  priority?: JobPriority | "all";
  status?: ApplicationStatus | "all";
  freshness?: "24h" | "2d" | "7d" | "all";
  search?: string;
  hideSkips?: boolean;
};

export type CollectionRunRequest = {
  sources: JobSource[];
  recentDays: number;
  query: string;
  location: string;
  maxPages: number;
};

export type CollectionRunResult = {
  source: JobSource;
  inserted: number;
  updated: number;
  jobs: Job[];
  warning?: string;
};

export type AppStats = {
  totalJobs: number;
  applyToday: number;
  worthReferral: number;
  shortlisted: number;
  applied: number;
  resumeLoaded: boolean;
};
