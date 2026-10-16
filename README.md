# Hue | AI color systems

Built by Ivan Rojas · ivanrojas.design

Describe a mood or a few keywords, get an accessible color system with a live
editable preview and WCAG contrast checks. AI generation runs through a safe
serverless function so the API key is never exposed to the browser.

## Tech
- React + Vite + Tailwind (front end)
- Vercel serverless function (`/api/generate`) that calls the Anthropic API
- API key stored as a Vercel environment variable (never in client code)

## Local dev (optional)
1. `npm install`
2. Add your key: create `.env` with `ANTHROPIC_API_KEY=sk-ant-...`
3. `npm run dev`

## Deploy
Push to GitHub, import into Vercel, add the `ANTHROPIC_API_KEY` environment
variable in Vercel project settings. Vercel auto-builds on every push.
