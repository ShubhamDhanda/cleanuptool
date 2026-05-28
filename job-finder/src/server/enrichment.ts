import type { SalaryEstimate } from "../shared/types";

type CompanySignal = {
  aliases: string[];
  productTier: "dream" | "strong" | "good" | "unknown";
  salary: SalaryEstimate;
};

const companySignals: CompanySignal[] = [
  {
    aliases: ["google", "youtube", "alphabet"],
    productTier: "dream",
    salary: { minLpa: 45, maxLpa: 85, expectedLpa: 60, confidence: "high", source: "manual-tier" }
  },
  {
    aliases: ["microsoft", "linkedin"],
    productTier: "dream",
    salary: { minLpa: 40, maxLpa: 75, expectedLpa: 55, confidence: "high", source: "manual-tier" }
  },
  {
    aliases: ["amazon", "aws"],
    productTier: "dream",
    salary: { minLpa: 38, maxLpa: 70, expectedLpa: 50, confidence: "high", source: "manual-tier" }
  },
  {
    aliases: ["atlassian", "uber", "salesforce", "adobe", "intuit", "rippling", "stripe", "coinbase"],
    productTier: "dream",
    salary: { minLpa: 45, maxLpa: 90, expectedLpa: 60, confidence: "medium", source: "manual-tier" }
  },
  {
    aliases: ["razorpay", "phonepe", "flipkart", "meesho", "swiggy", "zomato", "groww", "zerodha"],
    productTier: "strong",
    salary: { minLpa: 35, maxLpa: 65, expectedLpa: 45, confidence: "medium", source: "manual-tier" }
  },
  {
    aliases: ["mathworks", "servicenow", "freshworks", "browserstack", "postman", "tekion", "sharechat"],
    productTier: "strong",
    salary: { minLpa: 30, maxLpa: 55, expectedLpa: 40, confidence: "medium", source: "manual-tier" }
  },
  {
    aliases: ["zoho", "paytm", "makemytrip", "nykaa", "cred", "dream11", "navi"],
    productTier: "good",
    salary: { minLpa: 25, maxLpa: 48, expectedLpa: 35, confidence: "low", source: "manual-tier" }
  }
];

export function parseSalaryText(text = ""): SalaryEstimate | null {
  const normalized = text.toLowerCase().replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?|lakh|lac)/g)];
  if (!matches.length) return null;

  const values = matches.map((match) => Number(match[1])).filter(Number.isFinite);
  if (!values.length) return null;

  const minLpa = Math.min(...values);
  const maxLpa = Math.max(...values);
  return {
    minLpa,
    maxLpa,
    expectedLpa: Math.round(((minLpa + maxLpa) / 2) * 10) / 10,
    confidence: values.length > 1 ? "high" : "medium",
    source: "job-posting"
  };
}

export function estimateSalary(company: string, title: string, salaryText?: string): SalaryEstimate {
  const parsed = parseSalaryText(salaryText);
  if (parsed) return parsed;

  const haystack = `${company} ${title}`.toLowerCase();
  const signal = companySignals.find((candidate) =>
    candidate.aliases.some((alias) => haystack.includes(alias))
  );
  if (signal) return signal.salary;

  const seniorTitle = /\bsde\s*2\b|\bsde-?ii\b|\bsenior\b|\bstaff\b/i.test(title);
  return {
    minLpa: seniorTitle ? 28 : 22,
    maxLpa: seniorTitle ? 45 : 38,
    expectedLpa: seniorTitle ? 36 : 30,
    confidence: "unknown",
    source: "role-default"
  };
}

export function companyQualityScore(company: string): { score: number; tier: string } {
  const lower = company.toLowerCase();
  const signal = companySignals.find((candidate) =>
    candidate.aliases.some((alias) => lower.includes(alias))
  );
  if (!signal) return { score: 52, tier: "unknown" };
  if (signal.productTier === "dream") return { score: 95, tier: "dream" };
  if (signal.productTier === "strong") return { score: 82, tier: "strong" };
  return { score: 68, tier: "good" };
}
