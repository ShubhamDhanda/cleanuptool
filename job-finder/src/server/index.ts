import express from "express";
import cors from "cors";
import "dotenv/config";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { JobFinderDb } from "./db";
import { parseResumeLatex } from "./resume";
import { scoreJob } from "./scoring";
import { collectWithPlaywright, openLoginSession } from "./collectors/playwrightCollector";
import { sampleJobs } from "./collectors/fixtures";
import { jobsToCsv } from "./csv";
import { enhanceResumeSuggestions } from "./ai";
import type { ApplicationStatus, CollectionRunRequest, DashboardFilters, JobSource } from "../shared/types";

const app = express();
const db = new JobFinderDb();
const port = Number(process.env.PORT ?? 8787);
const defaultResumePath = resolve(process.cwd(), process.env.RESUME_LATEX_PATH ?? "resume.local.tex");

app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, stats: db.stats() });
});

app.get("/api/stats", (_req, res) => {
  res.json(db.stats());
});

app.post("/api/resume", (req, res) => {
  const schema = z.object({ latex: z.string().min(100) });
  const { latex } = schema.parse(req.body);
  const profile = db.saveResume(parseResumeLatex(latex));
  res.json(profile);
});

app.post("/api/resume/import-file", (req, res) => {
  const schema = z.object({ path: z.string().min(1).optional() });
  const body = schema.parse(req.body ?? {});
  const resumePath = body.path ? resolve(process.cwd(), body.path) : defaultResumePath;
  if (!existsSync(resumePath)) {
    res.status(404).json({
      error: `Resume file not found at ${resumePath}. Create resume.local.tex or set RESUME_LATEX_PATH.`
    });
    return;
  }
  const latex = readFileSync(resumePath, "utf8");
  if (latex.trim().length < 100) {
    res.status(400).json({ error: `Resume file at ${resumePath} looks too short.` });
    return;
  }
  const profile = db.saveResume(parseResumeLatex(latex));
  res.json({ ...profile, sourcePath: resumePath });
});

app.get("/api/resume", (_req, res) => {
  res.json(db.getLatestResume());
});

app.get("/api/jobs", (req, res) => {
  const filters: DashboardFilters = {
    source: stringOrUndefined(req.query.source) as DashboardFilters["source"],
    priority: stringOrUndefined(req.query.priority) as DashboardFilters["priority"],
    status: stringOrUndefined(req.query.status) as DashboardFilters["status"],
    freshness: stringOrUndefined(req.query.freshness) as DashboardFilters["freshness"],
    search: stringOrUndefined(req.query.search),
    hideSkips: req.query.hideSkips === "true"
  };
  res.json(db.listDashboardJobs(filters));
});

app.post("/api/collect/fixtures", (_req, res) => {
  const result = db.upsertJobs(sampleJobs);
  res.json({ ...result, jobs: sampleJobs });
});

app.post("/api/collect/login/:source", async (req, res, next) => {
  try {
    const source = req.params.source as JobSource;
    res.json(await openLoginSession(source));
  } catch (error) {
    next(error);
  }
});

app.post("/api/collect/run", async (req, res, next) => {
  try {
    const schema = z.object({
      sources: z.array(z.enum(["instahyre", "naukri", "linkedin", "fixture"])).default([
        "instahyre",
        "naukri",
        "linkedin"
      ]),
      recentDays: z.number().min(1).max(30).default(7),
      query: z.string().default("backend platform engineer golang"),
      location: z.string().default("Bengaluru Hyderabad NCR Remote India"),
      maxPages: z.number().min(1).max(5).default(2)
    });
    const request = schema.parse(req.body) as CollectionRunRequest;
    const results = [];

    if (request.sources.includes("fixture")) {
      const run = db.upsertJobs(sampleJobs);
      results.push({ source: "fixture", ...run, jobs: sampleJobs });
    }

    const browserSources = request.sources.filter((source) => source !== "fixture");
    if (browserSources.length) {
      const collected = await collectWithPlaywright({ ...request, sources: browserSources });
      for (const sourceResult of collected) {
        const run = db.upsertJobs(sourceResult.jobs);
        results.push({ ...sourceResult, ...run });
      }
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

app.post("/api/score", async (req, res, next) => {
  try {
    const schema = z.object({ useAi: z.boolean().default(false) });
    const { useAi } = schema.parse(req.body ?? {});
    const profile = db.getLatestResume();
    if (!profile) {
      res.status(400).json({ error: "Import your resume before scoring jobs." });
      return;
    }

    const jobs = db.listJobs();
    const scoreRecords = jobs
      .filter((job) => job.id)
      .map((job) => ({ jobId: job.id!, score: scoreJob(job, profile) }));
    db.saveScores(scoreRecords);

    if (useAi && process.env.OPENAI_API_KEY) {
      const dashboardJobs = db.listDashboardJobs({ hideSkips: true });
      const enhancements = await enhanceResumeSuggestions(dashboardJobs, profile);
      const enhancedRecords = dashboardJobs
        .filter((job) => job.id && job.score && enhancements.has(job.id))
        .map((job) => {
          const enhancement = enhancements.get(job.id!)!;
          return {
            jobId: job.id!,
            score: {
              ...job.score!,
              resumeSuggestions:
                enhancement.resumeSuggestions.length > 0
                  ? enhancement.resumeSuggestions
                  : job.score!.resumeSuggestions,
              reasoning: enhancement.reasoning || job.score!.reasoning,
              scoredAt: new Date().toISOString()
            }
          };
        });
      db.saveScores(enhancedRecords);
    }

    res.json({ scored: scoreRecords.length, aiEnhanced: useAi && Boolean(process.env.OPENAI_API_KEY) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/applications/:jobId", (req, res) => {
  const schema = z.object({
    status: z.enum(["new", "shortlisted", "applied", "rejected", "archived"]),
    notes: z.string().optional(),
    resumeVariant: z.string().optional(),
    appliedAt: z.string().nullable().optional()
  });
  const body = schema.parse(req.body);
  db.updateApplication(
    Number(req.params.jobId),
    body.status as ApplicationStatus,
    body.notes ?? "",
    body.resumeVariant ?? "",
    body.appliedAt ?? (body.status === "applied" ? new Date().toISOString() : null)
  );
  res.json({ ok: true });
});

app.get("/api/export.csv", (req, res) => {
  const jobs = db.listDashboardJobs({
    hideSkips: req.query.hideSkips !== "false",
    status: stringOrUndefined(req.query.status) as DashboardFilters["status"]
  });
  res.header("content-type", "text/csv; charset=utf-8");
  res.attachment(`job-finder-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(jobsToCsv(jobs));
});

const distPath = resolve(process.cwd(), "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(resolve(distPath, "index.html")));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Job Finder API running on http://127.0.0.1:${port}`);
});

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
