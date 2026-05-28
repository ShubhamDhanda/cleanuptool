# Job Finder

Local job-search dashboard for Shubham's 40L+ product-company switch search.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

For Playwright collection, install Chromium once:

```bash
npm run playwright:install
```

Set `OPENAI_API_KEY` in `.env` or the shell to enable AI resume suggestions during scoring.

## Workflow

1. Add your LaTeX resume either by pasting it in the app or by keeping it in `resume.local.tex` at the project root and clicking `Import File`.
2. Use `Sample` to load fixture jobs, or open login sessions for Instahyre/Naukri/LinkedIn.
3. Run `Collect`.
4. Run `Score`.
5. Shortlist/apply/archive jobs and export CSV.

## Resume File

Recommended local setup:

```bash
touch resume.local.tex
```

Paste your LaTeX resume into `resume.local.tex`, then use `Import File` in the dashboard. This file is ignored by git so your phone/email/resume details do not get committed by accident.

To use another path, set this in `.env`:

```bash
RESUME_LATEX_PATH=./path/to/resume.tex
```

The LinkedIn path is an assisted visible-page collector using your local browser profile. It does not perform credential automation, CAPTCHA bypass, proxy rotation, or bot-evasion behavior.
