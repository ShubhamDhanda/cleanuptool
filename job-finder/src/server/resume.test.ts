import { describe, expect, it } from "vitest";
import { parseResumeLatex } from "./resume";

const resume = String.raw`
\newcommand{\name}{Shubham Dhanda}
\section{\textbf{Summary}}
Backend platform engineer with 2 years at MathWorks building developer infrastructure in Go.
\section{\textbf{Skills}}
\textbf{Core}{: Golang, gRPC, JSON-RPC, Microservices, REST APIs, Distributed Systems, Platform Engineering}
\textbf{Infrastructure}{: Docker, Kubernetes, Helm, GitHub Actions, AWS}
`;

describe("parseResumeLatex", () => {
  it("extracts the target switching profile from LaTeX", () => {
    const profile = parseResumeLatex(resume);

    expect(profile.name).toBe("Shubham Dhanda");
    expect(profile.yearsExperience).toBe(2);
    expect(profile.currentCompLpa).toBe(28);
    expect(profile.targetCompLpa).toBe(40);
    expect(profile.coreSkills).toContain("Golang");
    expect(profile.infraSkills).toContain("Kubernetes");
  });
});
