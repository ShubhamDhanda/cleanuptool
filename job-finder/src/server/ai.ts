import OpenAI from "openai";
import type { DashboardJob, JobScore, ResumeProfile } from "../shared/types";

const model = "gpt-4.1-mini";

export async function enhanceResumeSuggestions(
  jobs: DashboardJob[],
  profile: ResumeProfile
): Promise<Map<number, Pick<JobScore, "resumeSuggestions" | "reasoning">>> {
  if (!process.env.OPENAI_API_KEY || jobs.length === 0) return new Map();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const topJobs = jobs
    .filter((job) => job.id && job.score)
    .slice(0, 12)
    .map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description?.slice(0, 1800),
      currentScore: job.score?.finalScore
    }));

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a senior India product-company job-search coach. Return compact JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "For each job, suggest resume tailoring changes for a 2 YOE backend/platform engineer targeting 40L+ TC. Do not invent experience.",
          resumeProfile: {
            headline: profile.headline,
            skills: [...profile.coreSkills, ...profile.infraSkills, ...profile.languages],
            summary: profile.summary
          },
          jobs: topJobs,
          responseShape: {
            jobs: [
              {
                id: "number",
                resumeSuggestions: ["2-4 concise suggestions"],
                reasoning: "one concise sentence"
              }
            ]
          }
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(content) as {
    jobs?: Array<{ id: number; resumeSuggestions?: string[]; reasoning?: string }>;
  };
  const map = new Map<number, Pick<JobScore, "resumeSuggestions" | "reasoning">>();
  for (const item of parsed.jobs ?? []) {
    if (!item.id) continue;
    map.set(item.id, {
      resumeSuggestions: item.resumeSuggestions?.filter(Boolean).slice(0, 4) ?? [],
      reasoning: item.reasoning ?? ""
    });
  }
  return map;
}
