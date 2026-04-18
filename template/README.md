# Code-Insight

A Slack AI agent that analyzes your codebase to assess feature implementation complexity and risk, then recommends the best developer to own it.

Mention `@Code Insight` in Slack → it searches your GitHub repos → returns a structured report with feasibility, risk factors, target files, and a recommended code owner.

---

## Architecture

Monorepo with [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) — core domain logic is fully decoupled from Slack, GitHub, and the LLM.

```
packages/
├── core/          # Pure domain logic: workflow, agents, entities
├── adapters/      # External integrations: Slack, GitHub, Gemini, Ollama
├── functions/     # Firebase Cloud Function (production)
└── localRun/      # Local Socket Mode server (development)
```

| Package | Runtime | LLM | Slack mode |
|---|---|---|---|
| `functions` | Firebase Cloud Functions v2 | Gemini | Events API (HTTP) |
| `localRun` | Node.js local process | Ollama | Socket Mode (WebSocket) |

---

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm i -g firebase-tools`
- `jq` — `brew install jq`
- [Ollama](https://ollama.com) (for local dev only)

---

## 1. Install

```bash
pnpm install
```

---

## 2. Local Development (Socket Mode)

Run the agent locally — no Firebase, no public URL needed. Slack connects via WebSocket.

### 2a. Create a local Slack app

```bash
curl -s -X POST https://slack.com/api/apps.manifest.create \
  -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"manifest\": $(cat packages/localRun/slack-manifest.json)}" | jq .
```

> Get `SLACK_CONFIG_TOKEN` from [api.slack.com/reference/manifests#config-tokens](https://api.slack.com/reference/manifests#config-tokens)

The response gives you `credentials.bot_token` and `credentials.signing_secret`.

Then go to **Slack App Settings → Basic Information → App-Level Tokens** → generate a token with `connections:write` scope. That is your `SLACK_APP_TOKEN`.

### 2b. Install the app to your workspace

Go to `https://api.slack.com/apps/<APP_ID>/install-on-team` and install it.  
Invite the bot to a channel: `/invite @Code Insight (Local)`

### 2c. Set up environment

```bash
cp .env.example .env
```

Fill in the `localRun` section:

```bash
SLACK_BOT_TOKEN=xoxb-...   # local dev app bot token
SLACK_APP_TOKEN=xapp-...   # app-level token (connections:write)
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org-or-username
```

### 2d. Start Ollama

```bash
ollama pull llama3.1   # or whichever model your ollamaProvider uses
ollama serve
```

### 2e. Run

```bash
pnpm local:run
# ⚡ Code Insight (local) is running via Socket Mode
#    Mention @Code Insight (Local) in Slack to analyze a feature
```

Mention `@Code Insight (Local)` in any channel the bot is in. `Ctrl+C` to stop.

---

## 3. Production Deployment (Firebase + Slack Events API)

One command deploys everything: builds packages, deploys Firebase, creates/updates the Slack app, and wires up all secrets.

### 3a. Prerequisites

- Firebase project created and configured in `packages/functions/.firebaserc`
- Logged in: `firebase login`
- All required env vars set in your shell (see `.env.example` → functions section)

### 3b. Set env vars

```bash
export SLACK_CONFIG_TOKEN=xoxe.xoxp-...
export GITHUB_OWNER=your-org-or-username
export GITHUB_TOKEN=ghp_...
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

### 3c. Deploy

```bash
pnpm deploy:full
```

This runs `scripts/deploy.sh` which:

1. Writes `GITHUB_OWNER` to `packages/functions/.env` (Firebase picks this up as a function env var)
2. Syncs `GITHUB_TOKEN` and `GOOGLE_GENERATIVE_AI_API_KEY` to Firebase Secret Manager
3. Builds all packages (`pnpm build`)
4. Deploys the Firebase function
5. Fetches the live function URL
6. Creates the Slack app from `packages/functions/slack-manifest.json` **(first run)** or updates its manifest **(subsequent runs)**
7. Sets `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in Firebase Secret Manager

State is persisted in `.deploy-state` (gitignored) — stores the Slack `APP_ID` so re-runs update instead of creating a new app.

### 3d. First-run only: install the app

After the first deploy, install the app to your workspace:

```
https://api.slack.com/apps/<APP_ID>/install-on-team
```

Invite the bot to a channel: `/invite @Code Insight`

### 3e. Subsequent deploys

```bash
pnpm deploy:full   # secrets and manifest stay in sync automatically
```

---

## How It Works

```
User: @Code Insight What do we need to add phone auth?
         │
         ▼
  👀 (acknowledged)
         │
         ▼
  AI Agent Loop
  ├── searchCode("phone auth")
  ├── getFileContent("src/auth/...")
  └── getLastModifier("src/auth/...")  ← repeat up to N steps
         │
         ▼
  Complexity Report
  ├── Feasibility: Possible / Difficult / Not Feasible
  ├── Complexity: High / Medium / Low
  ├── Risk Factors (with severity)
  ├── Target Files
  └── Recommended Owner (recent committer)
         │
         ▼
  Block Kit message posted in thread ✅
         │
         ▼
  PM clicks "Request Review" → owner pinged in thread
```

---

## Project Commands

```bash
pnpm build          # Build all packages
pnpm local:run      # Start local Socket Mode server
pnpm deploy         # Deploy Firebase function only (no Slack setup)
pnpm deploy:full    # Full deploy: Firebase + Slack app + secrets
pnpm lint           # Lint all packages
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format all packages
```

---

## Environment Variables

See `.env.example` for the full reference, split by context:

| Variable | Used by | How to set |
|---|---|---|
| `SLACK_BOT_TOKEN` | `functions`, `localRun` | Firebase Secret Manager (prod) / `.env` (local) |
| `SLACK_SIGNING_SECRET` | `functions` | Firebase Secret Manager |
| `SLACK_APP_TOKEN` | `localRun` | `.env` |
| `SLACK_CONFIG_TOKEN` | `scripts/deploy.sh` | Shell env |
| `GITHUB_TOKEN` | `functions`, `localRun` | Firebase Secret Manager (prod) / `.env` (local) |
| `GITHUB_OWNER` | `functions`, `localRun` | `packages/functions/.env` (prod, auto-written by deploy) / `.env` (local) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `functions` | Firebase Secret Manager |
| `FIREBASE_REGION` | `scripts/deploy.sh` | Shell env (default: `us-central1`) |
| `MAX_INVESTIGATION_STEPS` | `functions`, `localRun` | Shell env (default: `5`) |
