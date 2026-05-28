import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ApplicationStatus,
  AppStats,
  DashboardFilters,
  DashboardJob,
  Job,
  JobScore,
  ResumeProfile
} from "../shared/types";

type RunResult = {
  inserted: number;
  updated: number;
};

const defaultDbPath = resolve(process.cwd(), "data", "job-finder.sqlite");

export class JobFinderDb {
  private db: DatabaseSync;

  constructor(path = process.env.JOB_FINDER_DB_PATH ?? defaultDbPath) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resume_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_latex TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        external_id TEXT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        posted_at TEXT,
        collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        link TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        salary_text TEXT NOT NULL DEFAULT '',
        seniority TEXT NOT NULL DEFAULT '',
        skills_json TEXT NOT NULL DEFAULT '[]',
        UNIQUE(source, link)
      );

      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE,
        fit_score INTEGER NOT NULL,
        compensation_score INTEGER NOT NULL,
        freshness_score INTEGER NOT NULL,
        company_score INTEGER NOT NULL,
        location_score INTEGER NOT NULL,
        final_score INTEGER NOT NULL,
        priority TEXT NOT NULL,
        salary_json TEXT NOT NULL,
        match_signals_json TEXT NOT NULL,
        concerns_json TEXT NOT NULL,
        resume_suggestions_json TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        scored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS applications (
        job_id INTEGER PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT NOT NULL DEFAULT '',
        applied_at TEXT,
        resume_variant TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );
    `);
  }

  saveResume(profile: ResumeProfile): ResumeProfile {
    const result = this.db
      .prepare("INSERT INTO resume_profiles (raw_latex, profile_json) VALUES (?, ?)")
      .run(profile.rawLatex, JSON.stringify(profile));
    return { ...profile, id: Number(result.lastInsertRowid) };
  }

  getLatestResume(): ResumeProfile | null {
    const row = this.db
      .prepare("SELECT id, profile_json FROM resume_profiles ORDER BY id DESC LIMIT 1")
      .get() as { id: number; profile_json: string } | undefined;
    if (!row) return null;
    return { ...(JSON.parse(row.profile_json) as ResumeProfile), id: row.id };
  }

  upsertJobs(jobs: Job[]): RunResult {
    let inserted = 0;
    let updated = 0;
    const insert = this.db.prepare(`
      INSERT INTO jobs (
        source, external_id, title, company, location, posted_at, collected_at,
        link, description, salary_text, seniority, skills_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, link) DO UPDATE SET
        title = excluded.title,
        company = excluded.company,
        location = excluded.location,
        posted_at = COALESCE(excluded.posted_at, jobs.posted_at),
        collected_at = excluded.collected_at,
        description = COALESCE(NULLIF(excluded.description, ''), jobs.description),
        salary_text = COALESCE(NULLIF(excluded.salary_text, ''), jobs.salary_text),
        seniority = COALESCE(NULLIF(excluded.seniority, ''), jobs.seniority),
        skills_json = excluded.skills_json
    `);

    this.db.exec("BEGIN");
    try {
      for (const job of jobs) {
        const before = this.db
          .prepare("SELECT id FROM jobs WHERE source = ? AND link = ?")
          .get(job.source, job.link);
        insert.run(
          job.source,
          job.externalId ?? null,
          job.title,
          job.company,
          job.location,
          job.postedAt ?? null,
          job.collectedAt ?? new Date().toISOString(),
          job.link,
          job.description ?? "",
          job.salaryText ?? "",
          job.seniority ?? "",
          JSON.stringify(job.skills ?? [])
        );
        if (before) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { inserted, updated };
  }

  listJobs(): Job[] {
    const rows = this.db.prepare("SELECT * FROM jobs ORDER BY collected_at DESC").all() as DbJobRow[];
    return rows.map(rowToJob);
  }

  listDashboardJobs(filters: DashboardFilters = {}): DashboardJob[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          j.*,
          s.id AS score_id,
          s.fit_score,
          s.compensation_score,
          s.freshness_score,
          s.company_score,
          s.location_score,
          s.final_score,
          s.priority,
          s.salary_json,
          s.match_signals_json,
          s.concerns_json,
          s.resume_suggestions_json,
          s.reasoning,
          s.scored_at,
          COALESCE(a.status, 'new') AS application_status,
          COALESCE(a.notes, '') AS notes,
          a.applied_at,
          COALESCE(a.resume_variant, '') AS resume_variant
        FROM jobs j
        LEFT JOIN scores s ON s.job_id = j.id
        LEFT JOIN applications a ON a.job_id = j.id
        ORDER BY COALESCE(s.final_score, 0) DESC, j.collected_at DESC
      `
      )
      .all() as DashboardRow[];

    return rows.map(rowToDashboardJob).filter((job) => matchesFilters(job, filters));
  }

  saveScores(scores: Array<{ jobId: number; score: JobScore }>): void {
    const statement = this.db.prepare(`
      INSERT INTO scores (
        job_id, fit_score, compensation_score, freshness_score, company_score,
        location_score, final_score, priority, salary_json, match_signals_json,
        concerns_json, resume_suggestions_json, reasoning, scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        fit_score = excluded.fit_score,
        compensation_score = excluded.compensation_score,
        freshness_score = excluded.freshness_score,
        company_score = excluded.company_score,
        location_score = excluded.location_score,
        final_score = excluded.final_score,
        priority = excluded.priority,
        salary_json = excluded.salary_json,
        match_signals_json = excluded.match_signals_json,
        concerns_json = excluded.concerns_json,
        resume_suggestions_json = excluded.resume_suggestions_json,
        reasoning = excluded.reasoning,
        scored_at = excluded.scored_at
    `);

    this.db.exec("BEGIN");
    try {
      for (const { jobId, score } of scores) {
        statement.run(
          jobId,
          score.fitScore,
          score.compensationScore,
          score.freshnessScore,
          score.companyScore,
          score.locationScore,
          score.finalScore,
          score.priority,
          JSON.stringify(score.salaryEstimate),
          JSON.stringify(score.matchSignals),
          JSON.stringify(score.concerns),
          JSON.stringify(score.resumeSuggestions),
          score.reasoning,
          score.scoredAt ?? new Date().toISOString()
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  updateApplication(
    jobId: number,
    status: ApplicationStatus,
    notes = "",
    resumeVariant = "",
    appliedAt: string | null = null
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO applications (job_id, status, notes, applied_at, resume_variant, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = excluded.status,
          notes = excluded.notes,
          applied_at = excluded.applied_at,
          resume_variant = excluded.resume_variant,
          updated_at = excluded.updated_at
      `
      )
      .run(jobId, status, notes, appliedAt, resumeVariant, new Date().toISOString());
  }

  stats(): AppStats {
    const totalJobs = count(this.db, "SELECT COUNT(*) AS count FROM jobs");
    const applyToday = count(this.db, "SELECT COUNT(*) AS count FROM scores WHERE priority = 'Apply Today'");
    const worthReferral = count(
      this.db,
      "SELECT COUNT(*) AS count FROM scores WHERE priority = 'Worth Referral'"
    );
    const shortlisted = count(
      this.db,
      "SELECT COUNT(*) AS count FROM applications WHERE status = 'shortlisted'"
    );
    const applied = count(this.db, "SELECT COUNT(*) AS count FROM applications WHERE status = 'applied'");
    const resumeLoaded = count(this.db, "SELECT COUNT(*) AS count FROM resume_profiles") > 0;
    return { totalJobs, applyToday, worthReferral, shortlisted, applied, resumeLoaded };
  }
}

type DbJobRow = {
  id: number;
  source: Job["source"];
  external_id: string | null;
  title: string;
  company: string;
  location: string;
  posted_at: string | null;
  collected_at: string;
  link: string;
  description: string;
  salary_text: string;
  seniority: string;
  skills_json: string;
};

type DashboardRow = DbJobRow & {
  score_id: number | null;
  fit_score: number | null;
  compensation_score: number | null;
  freshness_score: number | null;
  company_score: number | null;
  location_score: number | null;
  final_score: number | null;
  priority: JobScore["priority"] | null;
  salary_json: string | null;
  match_signals_json: string | null;
  concerns_json: string | null;
  resume_suggestions_json: string | null;
  reasoning: string | null;
  scored_at: string | null;
  application_status: ApplicationStatus;
  notes: string;
  applied_at: string | null;
  resume_variant: string;
};

function rowToJob(row: DbJobRow): Job {
  return {
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    company: row.company,
    location: row.location,
    postedAt: row.posted_at,
    collectedAt: row.collected_at,
    link: row.link,
    description: row.description,
    salaryText: row.salary_text,
    seniority: row.seniority,
    skills: JSON.parse(row.skills_json || "[]") as string[]
  };
}

function rowToDashboardJob(row: DashboardRow): DashboardJob {
  const job = rowToJob(row);
  return {
    ...job,
    applicationStatus: row.application_status,
    notes: row.notes,
    appliedAt: row.applied_at,
    resumeVariant: row.resume_variant,
    score: row.score_id
      ? {
          id: row.score_id,
          jobId: row.id,
          fitScore: row.fit_score ?? 0,
          compensationScore: row.compensation_score ?? 0,
          freshnessScore: row.freshness_score ?? 0,
          companyScore: row.company_score ?? 0,
          locationScore: row.location_score ?? 0,
          finalScore: row.final_score ?? 0,
          priority: row.priority ?? "Maybe",
          salaryEstimate: JSON.parse(row.salary_json ?? "{}"),
          matchSignals: JSON.parse(row.match_signals_json ?? "[]"),
          concerns: JSON.parse(row.concerns_json ?? "[]"),
          resumeSuggestions: JSON.parse(row.resume_suggestions_json ?? "[]"),
          reasoning: row.reasoning ?? "",
          scoredAt: row.scored_at ?? undefined
        }
      : null
  };
}

function matchesFilters(job: DashboardJob, filters: DashboardFilters): boolean {
  if (filters.source && filters.source !== "all" && job.source !== filters.source) return false;
  if (filters.priority && filters.priority !== "all" && job.score?.priority !== filters.priority) return false;
  if (filters.status && filters.status !== "all" && job.applicationStatus !== filters.status) return false;
  if (filters.hideSkips && job.score?.priority === "Skip") return false;
  if (filters.search) {
    const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
    if (!text.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.freshness && filters.freshness !== "all") {
    if (!job.postedAt) return false;
    const ageMs = Date.now() - new Date(job.postedAt).getTime();
    const maxDays = filters.freshness === "24h" ? 1 : filters.freshness === "2d" ? 2 : 7;
    if (ageMs > maxDays * 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

function count(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { count: number };
  return Number(row.count);
}
