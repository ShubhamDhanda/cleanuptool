import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import type { CollectionRunRequest, CollectionRunResult, Job, JobSource } from "../../shared/types";
import { parseJobsFromHtml } from "./parser";

const profileDir = resolve(process.cwd(), ".browser-profile");

const sourceHome: Record<JobSource, string> = {
  instahyre: "https://www.instahyre.com/",
  naukri: "https://www.naukri.com/",
  linkedin: "https://www.linkedin.com/jobs/",
  manual: "about:blank",
  fixture: "about:blank"
};

function searchUrl(source: JobSource, query: string, location: string): string {
  const encodedQuery = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location);
  if (source === "instahyre") {
    return `https://www.instahyre.com/search-jobs/?q=${encodedQuery}&loc=${encodedLocation}`;
  }
  if (source === "naukri") {
    return `https://www.naukri.com/${encodedQuery.replace(/%20/g, "-")}-jobs-in-${encodedLocation.replace(/%20/g, "-")}`;
  }
  if (source === "linkedin") {
    return `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}&location=${encodedLocation}&f_TPR=r604800`;
  }
  return sourceHome[source];
}

export async function collectWithPlaywright(
  request: CollectionRunRequest
): Promise<CollectionRunResult[]> {
  mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 }
  });

  const results: CollectionRunResult[] = [];
  try {
    for (const source of request.sources.filter((source) => source !== "manual" && source !== "fixture")) {
      const page = await context.newPage();
      const jobs: Job[] = [];
      let warning: string | undefined;

      try {
        await page.goto(searchUrl(source, request.query, request.location), {
          waitUntil: "domcontentloaded",
          timeout: 45_000
        });
        await page.waitForTimeout(5000);
        for (let pageIndex = 0; pageIndex < Math.max(1, request.maxPages); pageIndex += 1) {
          const html = await page.content();
          jobs.push(...parseJobsFromHtml(html, source, page.url()));
          await page.mouse.wheel(0, 2200);
          await page.waitForTimeout(1800);
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      } finally {
        await page.close();
      }

      results.push({ source, inserted: 0, updated: 0, jobs, warning });
    }
  } finally {
    await context.close();
  }

  return results;
}

export async function openLoginSession(source: JobSource): Promise<{ message: string }> {
  mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  await page.goto(sourceHome[source] ?? "https://www.google.com", {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  return {
    message:
      "Browser opened with the persistent job-finder profile. Log in there, then close the browser when done."
  };
}
