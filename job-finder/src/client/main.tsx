import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Play,
  RefreshCw,
  Search,
  Star,
  Upload
} from "lucide-react";
import type {
  AppStats,
  ApplicationStatus,
  CollectionRunResult,
  DashboardJob,
  JobPriority,
  JobSource,
  ResumeProfile
} from "../shared/types";
import "./styles.css";

const priorities: Array<JobPriority | "all"> = ["all", "Apply Today", "Worth Referral", "Maybe", "Skip"];
const statuses: Array<ApplicationStatus | "all"> = [
  "all",
  "new",
  "shortlisted",
  "applied",
  "rejected",
  "archived"
];
const sources: Array<JobSource | "all"> = ["all", "instahyre", "naukri", "linkedin", "fixture"];

function App() {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [resume, setResume] = useState<ResumeProfile | null>(null);
  const [resumeLatex, setResumeLatex] = useState("");
  const [resumePath, setResumePath] = useState("resume.local.tex");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<JobSource | "all">("all");
  const [priority, setPriority] = useState<JobPriority | "all">("all");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [freshness, setFreshness] = useState<"24h" | "2d" | "7d" | "all">("7d");
  const [hideSkips, setHideSkips] = useState(true);
  const [selectedSources, setSelectedSources] = useState<Record<JobSource, boolean>>({
    instahyre: true,
    naukri: true,
    linkedin: true,
    fixture: false,
    manual: false
  });

  async function refresh() {
    const params = new URLSearchParams();
    params.set("source", source);
    params.set("priority", priority);
    params.set("status", status);
    params.set("freshness", freshness);
    params.set("hideSkips", String(hideSkips));
    if (search.trim()) params.set("search", search.trim());
    const [jobsResponse, statsResponse, resumeResponse] = await Promise.all([
      fetch(`/api/jobs?${params}`),
      fetch("/api/stats"),
      fetch("/api/resume")
    ]);
    setJobs(await jobsResponse.json());
    setStats(await statsResponse.json());
    setResume(await resumeResponse.json());
  }

  useEffect(() => {
    void refresh();
  }, [source, priority, status, freshness, hideSkips]);

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  const visibleSources = useMemo(
    () => Object.entries(selectedSources).filter(([, enabled]) => enabled).map(([name]) => name as JobSource),
    [selectedSources]
  );

  const scoreAverage = jobs.length
    ? Math.round(jobs.reduce((sum, job) => sum + (job.score?.finalScore ?? 0), 0) / jobs.length)
    : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Job Finder</h1>
          <p>{resume ? `${resume.name} · ${resume.headline} · target ${resume.targetCompLpa}L+` : "Resume pending"}</p>
        </div>
        <div className="actions">
          <button title="Import resume" onClick={() => document.getElementById("resume-input")?.focus()}>
            <Upload size={18} /> Import Resume
          </button>
          <button
            title="Run fixture collection"
            onClick={() =>
              runAction("fixtures", async () => {
                await post("/api/collect/fixtures", {});
                setMessage("Sample jobs loaded.");
              })
            }
          >
            <FileText size={18} /> Sample
          </button>
          <button
            title="Run live collection"
            disabled={busy !== ""}
            onClick={() =>
              runAction("collect", async () => {
                const results = (await post("/api/collect/run", {
                  sources: visibleSources,
                  recentDays: 7,
                  query: "backend platform engineer golang",
                  location: "Bengaluru Hyderabad NCR Remote India",
                  maxPages: 2
                })) as CollectionRunResult[];
                const total = results.reduce((sum, result) => sum + result.inserted + result.updated, 0);
                setMessage(`Collection finished. ${total} job rows touched.`);
              })
            }
          >
            <Play size={18} /> Collect
          </button>
          <button
            title="Score jobs"
            disabled={busy !== ""}
            onClick={() =>
              runAction("score", async () => {
                await post("/api/score", { useAi: true });
                setMessage("Scoring complete.");
              })
            }
          >
            <Bot size={18} /> Score
          </button>
          <a className="button" title="Export CSV" href="/api/export.csv">
            <Download size={18} /> CSV
          </a>
        </div>
      </header>

      <section className="metric-row">
        <Metric label="Jobs" value={stats?.totalJobs ?? 0} />
        <Metric label="Apply Today" value={stats?.applyToday ?? 0} tone="green" />
        <Metric label="Worth Referral" value={stats?.worthReferral ?? 0} tone="blue" />
        <Metric label="Shortlisted" value={stats?.shortlisted ?? 0} tone="amber" />
        <Metric label="Avg Score" value={scoreAverage} />
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="field">
            <label htmlFor="resume-input">Resume LaTeX</label>
            <textarea
              id="resume-input"
              value={resumeLatex}
              onChange={(event) => setResumeLatex(event.target.value)}
              placeholder="Paste LaTeX resume"
            />
            <button
              disabled={resumeLatex.trim().length < 100 || busy !== ""}
              onClick={() =>
                runAction("resume", async () => {
                  await post("/api/resume", { latex: resumeLatex });
                  setResumeLatex("");
                  setMessage("Resume imported.");
                })
              }
            >
              <Upload size={16} /> Save Resume
            </button>
            <div className="inline-row">
              <input
                value={resumePath}
                onChange={(event) => setResumePath(event.target.value)}
                placeholder="resume.local.tex"
              />
              <button
                disabled={busy !== ""}
                onClick={() =>
                  runAction("resume-file", async () => {
                    const imported = (await post("/api/resume/import-file", {
                      path: resumePath.trim() || undefined
                    })) as ResumeProfile & { sourcePath?: string };
                    setMessage(`Imported ${imported.name} from ${imported.sourcePath ?? resumePath}.`);
                  })
                }
              >
                <FileText size={16} /> Import File
              </button>
            </div>
          </div>

          <div className="field compact">
            <label>Sources</label>
            {(["instahyre", "naukri", "linkedin", "fixture"] as JobSource[]).map((item) => (
              <label className="check" key={item}>
                <input
                  type="checkbox"
                  checked={selectedSources[item]}
                  onChange={(event) =>
                    setSelectedSources((current) => ({ ...current, [item]: event.target.checked }))
                  }
                />
                <span>{item}</span>
              </label>
            ))}
          </div>

          <div className="field compact">
            <label>Login Sessions</label>
            {(["instahyre", "naukri", "linkedin"] as JobSource[]).map((item) => (
              <button
                className="secondary"
                key={item}
                onClick={() =>
                  runAction(`login-${item}`, async () => {
                    await post(`/api/collect/login/${item}`, {});
                    setMessage(`${item} browser opened.`);
                  })
                }
              >
                <ExternalLink size={16} /> {item}
              </button>
            ))}
          </div>
        </aside>

        <section className="results">
          <div className="toolbar">
            <div className="searchbox">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void refresh();
                }}
                placeholder="Search jobs"
              />
            </div>
            <Select value={source} options={sources} onChange={(value) => setSource(value as JobSource | "all")} />
            <Select
              value={priority}
              options={priorities}
              onChange={(value) => setPriority(value as JobPriority | "all")}
            />
            <Select
              value={status}
              options={statuses}
              onChange={(value) => setStatus(value as ApplicationStatus | "all")}
            />
            <Select
              value={freshness}
              options={["24h", "2d", "7d", "all"]}
              onChange={(value) => setFreshness(value as "24h" | "2d" | "7d" | "all")}
            />
            <label className="toggle">
              <input type="checkbox" checked={hideSkips} onChange={(event) => setHideSkips(event.target.checked)} />
              <span>Hide skips</span>
            </label>
            <button className="icon-button" title="Refresh" onClick={() => void refresh()}>
              <RefreshCw size={18} />
            </button>
          </div>

          {message && <div className="notice">{message}</div>}
          {busy && <div className="notice active">Running {busy}...</div>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Salary</th>
                  <th>Signals</th>
                  <th>Status</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow key={`${job.source}-${job.id}-${job.link}`} job={job} onChange={refresh} />
                ))}
                {!jobs.length && (
                  <tr>
                    <td colSpan={7} className="empty">
                      No jobs in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Select({
  value,
  options,
  onChange
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function JobRow({ job, onChange }: { job: DashboardJob; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const score = job.score;
  const salary = score?.salaryEstimate.expectedLpa
    ? `${score.salaryEstimate.expectedLpa} LPA`
    : score?.salaryEstimate.source ?? "unknown";

  async function setStatus(status: ApplicationStatus) {
    await request(`/api/applications/${job.id}`, "PATCH", {
      status,
      notes: job.notes,
      resumeVariant: job.resumeVariant
    });
    await onChange();
  }

  return (
    <>
      <tr className={score?.priority === "Apply Today" ? "hot" : ""}>
        <td>
          <button className={`priority ${priorityClass(score?.priority)}`} onClick={() => setOpen(!open)}>
            {score?.priority ?? "Unscored"} {score ? score.finalScore : ""}
          </button>
        </td>
        <td>
          <strong>{job.company}</strong>
          <span>{job.source} · {job.location || "location n/a"}</span>
        </td>
        <td>
          <strong>{job.title}</strong>
          <span>{relative(job.postedAt)} · {job.seniority || "seniority n/a"}</span>
        </td>
        <td>
          <strong>{salary}</strong>
          <span>{score?.salaryEstimate.confidence ?? "unscored"}</span>
        </td>
        <td>
          <div className="chips">
            {(score?.matchSignals ?? job.skills ?? []).slice(0, 4).map((signal) => (
              <span key={signal}>{signal}</span>
            ))}
          </div>
        </td>
        <td>
          <div className="row-actions">
            <button title="Shortlist" onClick={() => setStatus("shortlisted")}>
              <Star size={16} />
            </button>
            <button title="Mark applied" onClick={() => setStatus("applied")}>
              <CheckCircle2 size={16} />
            </button>
            <button title="Archive" onClick={() => setStatus("archived")}>
              <Archive size={16} />
            </button>
          </div>
          <span>{job.applicationStatus}</span>
        </td>
        <td>
          <a className="external" href={job.link} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
          </a>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-grid">
              <div>
                <h3>Resume</h3>
                <ul>
                  {(score?.resumeSuggestions ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Concerns</h3>
                <ul>
                  {(score?.concerns?.length ? score.concerns : ["No major concern flagged."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Reasoning</h3>
                <p>{score?.reasoning ?? "Run scoring for details."}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

async function post(url: string, body: unknown) {
  return request(url, "POST", body);
}

async function request(url: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? response.statusText);
  return payload;
}

function priorityClass(priority?: JobPriority) {
  if (priority === "Apply Today") return "apply";
  if (priority === "Worth Referral") return "referral";
  if (priority === "Maybe") return "maybe";
  return "skip";
}

function relative(value?: string | null) {
  if (!value) return "date n/a";
  const hours = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 36e5));
  if (hours < 24) return `${hours || 1}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

createRoot(document.getElementById("root")!).render(<App />);
