import { describe, expect, it } from "vitest";
import { parseJobsFromHtml } from "./parser";

describe("parseJobsFromHtml", () => {
  it("parses Instahyre-like job cards", () => {
    const html = `
      <div class="job-card" data-job-id="i1">
        <a class="job-title" href="/jobs/backend-platform-engineer">Backend Platform Engineer</a>
        <div class="company">Postman</div>
        <div class="location">Bengaluru</div>
        <div class="posted">1 day ago</div>
        <div class="salary">40 LPA - 50 LPA</div>
        <p class="description">Go gRPC platform developer tooling</p>
      </div>
    `;

    const jobs = parseJobsFromHtml(html, "instahyre", "https://www.instahyre.com");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe("Postman");
    expect(jobs[0].link).toBe("https://www.instahyre.com/jobs/backend-platform-engineer");
  });

  it("parses LinkedIn-visible cards", () => {
    const html = `
      <li class="jobs-search-results__list-item" data-job-id="l1">
        <a class="job-card-list__title" href="/jobs/view/123">Software Engineer II, Backend</a>
        <div class="job-card-container__primary-description">Microsoft</div>
        <div class="job-card-container__metadata-item">Hyderabad</div>
      </li>
    `;

    const jobs = parseJobsFromHtml(html, "linkedin", "https://www.linkedin.com/jobs");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toContain("Backend");
    expect(jobs[0].company).toBe("Microsoft");
  });
});
