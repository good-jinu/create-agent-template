# My Assistant

Slack AI assistant powered by OpenAI, running on Firebase Cloud Functions.

---

## Prerequisites

Install [mise](https://mise.jdx.dev) — it manages Node.js, pnpm, and Firebase CLI versions automatically via `mise.toml`.

```bash
brew install mise
mise install
```

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure Firebase project

Set your Firebase project ID in `packages/functions/.firebaserc`:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

Then log in and set the active project:

```bash
firebase login
gcloud auth login
gcloud config set project your-firebase-project-id
```

### 3. Enable required Google Cloud APIs

Firebase Functions v2 runs on Cloud Run and depends on several GCP APIs that are not enabled by default. Enable them all at once:

```bash
gcloud services enable \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project=your-firebase-project-id
```

| API | Purpose |
|---|---|
| `firestore.googleapis.com` | Agent memory (vector search) |
| `secretmanager.googleapis.com` | Slack tokens and API keys |
| `cloudfunctions.googleapis.com` | Firebase Functions |
| `run.googleapis.com` | Firebase Functions v2 runtime |
| `cloudscheduler.googleapis.com` | Daily news summary schedule |
| `cloudbuild.googleapis.com` | Build pipeline for deployments |
| `artifactregistry.googleapis.com` | Container image storage |

### 4. Initialize Firestore

Create the Firestore database (only needed once per project):

```bash
gcloud firestore databases create \
  --location=us-central1 \
  --project=your-firebase-project-id
```

Then create the vector index used by the agent memory. This allows semantic search over past conversations:

```bash
gcloud alpha firestore indexes composite create \
  --project=your-firebase-project-id \
  --collection-group=agent_memory \
  --query-scope=COLLECTION \
  --field-config=field-path=embedding,vector-config='{"dimension":"1536","flat":{}}'
```

The index build takes a few minutes. You can check its status in the [Firebase Console → Firestore → Indexes](https://console.firebase.google.com) tab.

### 5. Prepare environment variables

Copy `.env.example` to `.env` and fill in the values you control up front:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Firebase deploy | Gemini API key |
| `OPENAI_API_KEY` | Firebase deploy | OpenAI API key |
| `SLACK_CONFIG_REFRESH_TOKEN` | Slack deploy | Recommended for automated Slack token rotation |
| `SLACK_CONFIG_TOKEN` | Slack deploy | Backup token if you do not have a refresh token |
| `SLACK_APP_TOKEN` | Local only | App-level token (`xapp-...`) for Socket Mode |
| `NEWS_SUMMARY_CHANNEL_ID` | Optional | Slack channel ID for daily news summary |

For the first run, make sure either `SLACK_CONFIG_REFRESH_TOKEN` or `SLACK_CONFIG_TOKEN` is set. Without one of those, `pnpm deploy:slack` cannot create or update the Slack app.

Do not fill in `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` manually on the first run. The deployment script creates the app, receives those values from Slack, and writes them into Firebase Secret Manager for you.

### 6. Bootstrap deployment

Set the OpenAI secret in Firebase first. The current Firebase deploy script syncs `GOOGLE_GENERATIVE_AI_API_KEY` automatically, but it does not write `OPENAI_API_KEY` for you:

```bash
source .env
printf "%s" "$OPENAI_API_KEY" | firebase functions:secrets:set OPENAI_API_KEY
```

Then run the Firebase deploy so the function exists:

```bash
pnpm deploy:firebase
```

Then create or update the Slack app manifest:

```bash
pnpm deploy:slack
```

On the first Slack deploy, the script creates the Slack app, receives `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`, syncs them to Firebase Secret Manager, and updates `.env` if it exists.

After that first Slack deploy, run Firebase deploy again so the function picks up the real secrets:

```bash
pnpm deploy:firebase
```

Finally, install the Slack app to your workspace using the install URL printed by the Slack deploy script.

---

## Deployment

### Full deployment (first time)

```bash
pnpm deploy:full
```

This runs Firebase deploy first, then Slack deploy. On the initial run, it also creates the Slack app and syncs the generated bot token and signing secret into Firebase. After the first run, you still need one more `pnpm deploy:firebase` so the deployed function picks up the real Slack secrets.

### Update Firebase only

```bash
pnpm deploy:firebase
```

### Update Slack manifest only

```bash
pnpm deploy:slack
```

### First-time Slack app setup

After the first Slack deploy:

1. Install the app to your workspace using the install URL printed by `pnpm deploy:slack`.
2. Confirm that `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` were written to Firebase Secret Manager.
3. Redeploy Firebase if you have not already done so: `pnpm deploy:firebase`

---

## Local Development

Local dev uses Slack Socket Mode — no public URL or ngrok needed.

### First-time local setup

1. In the Slack Dashboard, go to **Basic Information > App-Level Tokens** and generate a token with `connections:write` scope (`xapp-...`).
2. Install the local app version to get a bot token (`xoxb-...`).
3. Add both to your `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   ```
4. Deploy the local Slack manifest:
   ```bash
   pnpm deploy:slack:local
   ```

### Run locally

```bash
pnpm local:run
```

### Workflow eval workspace

The repository also includes a dedicated workspace for exercising the core workflows with local mock adapters:

```bash
pnpm eval:workflows
```

Edit [packages/workflow-eval/src/config.ts](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/src/config.ts) to change the default scenario, model provider, channel, or other run parameters.

The code is organized into:

| Folder | Purpose |
|---|---|
| [packages/workflow-eval/src/mockModules](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/src/mockModules) | Mock implementations for Slack, memory, config, news, and scraping |
| [packages/workflow-eval/src/utils](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/src/utils) | CSV parsing, fixture loading, and provider resolution |
| [packages/workflow-eval/src/cases](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/src/cases) | Workflow case runners and dispatcher |

Edit the per-case CSV bundles under [packages/workflow-eval/data/cases](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases) to change the test data:

| File | Purpose |
|---|---|
| [handleSlackMessage/env.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/handleSlackMessage/env.csv) | Eval config for the Slack case |
| [handleSlackMessage/input.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/handleSlackMessage/input.csv) | Slack message and thread input rows |
| [handleSlackMessage/eval.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/handleSlackMessage/eval.csv) | Slack case scoring expectations |
| [sendNewsSummary/env.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/sendNewsSummary/env.csv) | Eval config for the news case |
| [sendNewsSummary/input.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/sendNewsSummary/input.csv) | News article and scraped page input rows |
| [sendNewsSummary/eval.csv](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/data/cases/sendNewsSummary/eval.csv) | News case scoring expectations |

The eval runner prints a JSON report with per-case scores, notes, and captured outputs. Each case is scored with a small rubric so you can compare runs over time.
It also writes a timestamped copy of the report to `result/` at the repo root.

If you want to run a different variant without changing the fixtures, call the exported runner from [packages/workflow-eval/src/runner.ts](/Users/ijin-u/workspace_p/my-assistant/packages/workflow-eval/src/runner.ts) with a custom config object.

---

## Commands

```bash
pnpm build              # Build all packages
pnpm local:run          # Start the local agent (Socket Mode)
pnpm deploy:full        # Full production deployment
pnpm deploy:firebase    # Deploy Firebase functions only
pnpm deploy:slack       # Update production Slack manifest
pnpm deploy:slack:local # Update local Slack manifest (Socket Mode)
pnpm lint               # Lint all packages
pnpm format             # Format all packages
```
