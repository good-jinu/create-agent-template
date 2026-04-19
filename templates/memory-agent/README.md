# My Assistant

A personal AI assistant for Slack that helps you answer questions, provide information, and assist with tasks using conversation context.

---

## Architecture

Monorepo with [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) — core domain logic is fully decoupled from Slack and the LLM.

```
packages/
├── core/          # Pure domain logic: reasoning agent, tools
├── adapters/      # External integrations: Slack, Gemini
└── functions/     # Firebase Cloud Function (production)
```

| Package | Runtime | LLM | Slack mode |
|---|---|---|---|
| `functions` | Firebase Cloud Functions v2 | Gemini | Events API (HTTP) |

---

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- [Firebase CLI](https://firebase.google.com/docs/cli) — `npm i -g firebase-tools`
- `jq` — `brew install jq`

---

## 1. Install

```bash
pnpm install
```

---

## 2. Production Deployment (Firebase + Slack Events API)

One command deploys everything: builds packages, deploys Firebase, creates/updates the Slack app, and wires up all secrets.

### 2a. Prerequisites

- Firebase project created and configured in `packages/functions/.firebaserc`
- Logged in: `firebase login`
- All required env vars set in your shell (see `.env.example`)

### 2b. Set env vars

```bash
export SLACK_CONFIG_TOKEN=xoxe.xoxp-...
export GOOGLE_GENERATIVE_AI_API_KEY=...
```

### 2c. Deploy
You can deploy everything at once, or deploy Firebase and Slack separately.

**Full Deployment:**
```bash
pnpm deploy:full
```

**Modular Deployment (Recommended for updates):**
```bash
pnpm deploy:firebase  # Only deploy code and sync core secrets
pnpm deploy:slack     # Only update Slack manifest/URL
```

These scripts:
1. Sync `GITHUB_TOKEN` and `GOOGLE_GENERATIVE_AI_API_KEY` to Firebase Secret Manager.
2. Build all packages (`pnpm build`).
3. Deploy the Firebase function.
4. Fetch the live function URL.
5. Update the Slack App manifest in `packages/functions/slack-manifest.json` with the new URL.

### 2d. First-run only: Manual Steps
After the first app creation, you must manually:
1. **Install** the app to your workspace: `https://api.slack.com/apps/<APP_ID>/install-on-team`
2. **Update Tokens**: Once installed, Slack will issue an `xoxb-` token. Copy this into your `.env` and Firebase Secret Manager.

---

## 3. Local Development (Socket Mode)
For local development, we use **Socket Mode**. This allows the agent to run on your machine and communicate with Slack via a persistent WebSocket, so you don't need `ngrok` or a public URL.

### 3a. Configure Slack for Local
Run the specialized local manifest deployment:
```bash
pnpm deploy:slack:local
```
This uses `packages/localRun/slack-manifest.json` which has `socket_mode_enabled: true`.

### 3b. Manual Token Setup (First time only)
1. **App Token**: Go to **Basic Information** > **App-Level Tokens** in the Slack Dashboard. Generate a token with `connections:write` scope. This is your `SLACK_APP_TOKEN` (`xapp-...`).
2. **Bot Token**: Install the local version of the app to your workspace to get your `SLACK_BOT_TOKEN` (`xoxb-...`).
3. **Update .env**:
   ```bash
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   ```

### 3c. Run Locally
```bash
pnpm local:run
```

---

## How It Works

```
User: @My Assistant What was we discussing about the new design?
         │
         ▼
  Reasoning Step (DecisionAgent)
  ├── Fetches recent context
  ├── Decides: "Should I respond?"
  └── Decides: "Emoji, thread reply, or channel message?"
         │
         ▼
  Execution Phase
  ├── searchSlackMessages(query) if needed
  └── Post response to Slack ✅
```

---

## Project Commands

```bash
pnpm build              # Build all packages
pnpm deploy:firebase    # Deploy Firebase code and core secrets only
pnpm deploy:slack       # Update production Slack manifest
pnpm deploy:slack:local # Update local Slack manifest (Socket Mode)
pnpm deploy:full        # Complete production deployment
pnpm local:run          # Start the local agent (Socket Mode)
pnpm lint               # Lint all packages
pnpm format             # Format all packages
```
