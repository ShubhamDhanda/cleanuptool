import type { Job } from "../../shared/types";

export const sampleJobs: Job[] = [
  {
    source: "fixture",
    title: "Backend Platform Engineer - Go, gRPC",
    company: "Razorpay",
    location: "Bengaluru / Remote India",
    postedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    collectedAt: new Date().toISOString(),
    link: "https://example.com/jobs/razorpay-backend-platform",
    description:
      "Build Go microservices, gRPC APIs, developer tooling, Kubernetes deployments and platform infrastructure for payments scale.",
    salaryText: "40 LPA - 55 LPA",
    seniority: "SDE-2",
    skills: ["Go", "gRPC", "Kubernetes", "Microservices", "Platform"]
  },
  {
    source: "fixture",
    title: "Software Development Engineer II - Backend",
    company: "Freshworks",
    location: "Hyderabad",
    postedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    collectedAt: new Date().toISOString(),
    link: "https://example.com/jobs/freshworks-sde2-backend",
    description: "Own backend services, REST APIs, distributed systems and developer productivity workflows.",
    salaryText: "",
    seniority: "SDE-2",
    skills: ["Backend", "Distributed Systems", "REST APIs"]
  },
  {
    source: "fixture",
    title: "PHP Support Engineer",
    company: "Unknown Services",
    location: "Mumbai",
    postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    collectedAt: new Date().toISOString(),
    link: "https://example.com/jobs/php-support",
    description: "Manual support, WordPress maintenance and customer issue handling.",
    salaryText: "8 LPA",
    seniority: "Junior",
    skills: ["PHP", "Support"]
  }
];
