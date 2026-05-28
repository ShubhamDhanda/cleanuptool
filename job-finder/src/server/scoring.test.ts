import { describe, expect, it } from "vitest";
import type { Job, ResumeProfile } from "../shared/types";
import { parseResumeLatex } from "./resume";
import { scoreJob } from "./scoring";

const profile: ResumeProfile = parseResumeLatex(String.raw`
\newcommand{\name}{Shubham Dhanda}
Backend platform engineer with 2 years at MathWorks building developer infrastructure in Go.
Golang gRPC JSON-RPC Microservices REST APIs Distributed Systems Platform Engineering Docker Kubernetes Helm
`);

function job(overrides: Partial<Job>): Job {
  return {
    source: "fixture",
    title: "Software Engineer",
    company: "Example",
    location: "Bengaluru",
    postedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    link: "https://example.com",
    description: "",
    salaryText: "",
    skills: [],
    ...overrides
  };
}

describe("scoreJob", () => {
  it("prioritizes high-comp Go backend platform product roles", () => {
    const score = scoreJob(
      job({
        title: "Backend Platform Engineer - Go gRPC",
        company: "Razorpay",
        description: "Go microservices gRPC Kubernetes platform infrastructure distributed systems",
        salaryText: "42 LPA - 55 LPA"
      }),
      profile
    );

    expect(score.priority).toBe("Apply Today");
    expect(score.finalScore).toBeGreaterThanOrEqual(80);
  });

  it("keeps generic backend roles as maybe/referral depending on signals", () => {
    const score = scoreJob(
      job({
        title: "Java Backend Engineer",
        company: "Unknown Product",
        description: "REST APIs Java Spring distributed backend",
        salaryText: "30 LPA"
      }),
      profile
    );

    expect(["Maybe", "Worth Referral"]).toContain(score.priority);
  });

  it("skips low-comp support roles", () => {
    const score = scoreJob(
      job({
        title: "PHP Support Engineer",
        company: "Unknown Services",
        location: "Mumbai",
        description: "manual support wordpress customer tickets",
        salaryText: "8 LPA"
      }),
      profile
    );

    expect(score.priority).toBe("Skip");
  });
});
