import * as cheerio from "cheerio";
import type { Job, JobSource } from "../../shared/types";

function text($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>, selectors: string[]): string {
  for (const selector of selectors) {
    const value = root.find(selector).first().text().replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}

function attr(
  root: cheerio.Cheerio<any>,
  selectors: string[],
  name: string,
  baseUrl: string
): string {
  for (const selector of selectors) {
    const value = root.find(selector).first().attr(name);
    if (value) return new URL(value, baseUrl).toString();
  }
  return "";
}

function parseRelativeDate(value: string): string | null {
  const lower = value.toLowerCase();
  const now = new Date();
  const number = Number(lower.match(/(\d+)/)?.[1] ?? "1");
  if (/hour|hr/.test(lower)) return new Date(now.getTime() - number * 60 * 60 * 1000).toISOString();
  if (/day|d ago|posted today|today/.test(lower)) {
    const days = /today/.test(lower) ? 0 : number;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  if (/week/.test(lower)) return new Date(now.getTime() - number * 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function genericCards($: cheerio.CheerioAPI, source: JobSource): cheerio.Cheerio<any> {
  const sourceSelectors: Record<JobSource, string> = {
    instahyre: ".opportunity, .job, .job-card, [data-job-id]",
    naukri: ".srp-jobtuple-wrapper, .jobTuple, article.jobTuple, .job-card, [data-job-id]",
    linkedin: ".jobs-search-results__list-item, .job-card-container, .jobs-job-board-list__item, [data-job-id]",
    manual: ".job, .job-card, article, [data-job-id]",
    fixture: ".job, .job-card, article, [data-job-id]"
  };
  const cards = $(sourceSelectors[source]);
  return cards.length ? cards : $("article, li, .card").filter((_, element) => $(element).text().length > 80);
}

export function parseJobsFromHtml(html: string, source: JobSource, baseUrl: string): Job[] {
  const $ = cheerio.load(html);
  const jobs: Job[] = [];

  genericCards($, source).each((_, element) => {
    const root = $(element as any);
    const title =
      root.attr("data-title") ||
      text($, root, [
        ".title",
        ".job-title",
        ".jobTupleHeader a",
        ".row1 a",
        ".jobs-unified-top-card__job-title",
        ".job-card-list__title",
        "h1",
        "h2",
        "h3",
        "a"
      ]);
    const company =
      root.attr("data-company") ||
      text($, root, [
        ".company",
        ".company-name",
        ".comp-name",
        ".subTitle",
        ".job-card-container__primary-description",
        ".jobs-unified-top-card__company-name",
        ".employer"
      ]);
    const location =
      root.attr("data-location") ||
      text($, root, [
        ".location",
        ".locWdth",
        ".job-location",
        ".jobs-unified-top-card__bullet",
        ".job-card-container__metadata-item",
        "[class*=location]"
      ]);
    const link = attr(
      root,
      [
        "a.title",
        ".job-title a",
        ".jobTupleHeader a",
        ".row1 a",
        ".job-card-list__title",
        "a[href*='job']",
        "a"
      ],
      "href",
      baseUrl
    );
    const postedText =
      root.attr("data-posted") ||
      text($, root, [".posted", ".job-post-day", ".type", ".freshness", "time", "[class*=date]"]);
    const salaryText = text($, root, [".salary", ".sal", ".job-salary", "[class*=salary]"]);
    const description = text($, root, [".description", ".job-description", ".job-desc", ".tags-gt", "p"]);
    const skills = root
      .find(".skill, .tag, .tags, .job-tags, .ni-job-tuple-icon-srp-experience + span")
      .map((__, skill) => $(skill).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean)
      .slice(0, 12);

    if (!title || !company || !link) return;

    jobs.push({
      source,
      externalId: root.attr("data-job-id") ?? null,
      title,
      company,
      location,
      postedAt: parseRelativeDate(postedText),
      collectedAt: new Date().toISOString(),
      link,
      description,
      salaryText,
      seniority: "",
      skills
    });
  });

  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.source}:${job.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
