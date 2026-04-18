# @goodjinu/create-agent-template

Scaffold a production-ready AI agent project with **Hexagonal Architecture**, **Firebase Functions**, and **Slack** integration in seconds.

Inspired by `create-next-app`, this CLI tool sets up a monorepo containing everything you need to build and deploy a sophisticated AI agent.

---

## 🚀 Quick Start

You can start a new project without installing anything globally using `npx`:

```bash
npx @goodjinu/create-agent-template my-ai-agent
```

Follow the prompts to name your project and install dependencies.

---

## 🛠️ Generated Project Overview

The scaffolded project uses a **Hexagonal Architecture** to ensure your core logic is decoupled from external services (Slack, GitHub, LLMs).

### Project Structure
- `packages/core`: Pure domain logic and workflows.
- `packages/adapters`: Implementation of external integrations (Slack, GitHub, Gemini, Ollama).
- `packages/functions`: Firebase Cloud Functions for production deployment.
- `packages/localRun`: Local development server using Slack Socket Mode.

---

## 💻 Local Development

1. **Enter your project:**
   ```bash
   cd my-ai-agent
   cp .env.example .env
   ```

2. **Configure Slack:**
   Follow the instructions in the generated `README.md` to create a local Slack App and get your tokens.

3. **Run locally:**
   ```bash
   pnpm local:run
   ```
   *Note: Local development defaults to using **Ollama** for a fully local experience.*

---

## 🚢 Production Deployment

The project includes a robust deployment script that handles Firebase Functions, Secret Manager, and Slack App Manifests.

### 1. Set Required Environment Variables
```bash
export SLACK_CONFIG_TOKEN="xoxp-..." # Get from https://api.slack.com/reference/manifests#config-tokens
export GITHUB_OWNER="your-username"
export GITHUB_TOKEN="ghp_..."
export SLACK_CHANNEL_ID="C1234567"
export GOOGLE_GENERATIVE_AI_API_KEY="your-api-key"
```

### 2. Deploy Everything
```bash
pnpm deploy:full
```

**What this script does:**
- Builds all packages.
- Syncs secrets to **Firebase Secret Manager**.
- Deploys **Firebase Functions**.
- **Automatically creates/updates your Slack App** via the Manifest API and wires up the Webhook URLs.

---

## 📦 How to "Deploy" this CLI (For Maintainers)

If you are contributing to this template and want to publish updates to npm:

1. **Build the CLI:**
   ```bash
   pnpm build
   ```

2. **Publish:**
   ```bash
   npm publish --access public
   ```

---

## License
MIT
