# Architecture

All templates in this repository share the same structural blueprint. They differ only in domain-specific agents and adapters, not in how the packages relate to each other.

## Package Layout

Every template is a pnpm monorepo with exactly four packages:

```
packages/core       → application core (agents, workflows, domain types)
packages/adapters   → infrastructure adapters (LLM, Slack, memory, external APIs)
packages/functions  → Firebase Cloud Functions composition root
packages/localRun   → local Socket Mode composition root
```

## Dependency Direction

```
functions ──┐
            ├──→ adapters ──→ core
localRun ───┘
```

- `core` has no knowledge of any outer layer
- `adapters` may import from `core` (to implement core-defined interfaces)
- `functions` and `localRun` import from both `adapters` and `core`
- Reverse imports are never allowed

## Layer Responsibilities

### `packages/core`

Owns all business rules and orchestration. Nothing here knows about Firebase, Slack, or any SDK.

Put here:
- Agents and their prompts
- Workflow / use-case functions
- Port interfaces for external services
- Domain types and entities

Do not put here:
- Firebase, Slack Bolt, Firestore, or LanceDB imports
- `process.env` access
- Provider selection or SDK initialization
- Runtime bootstrap code

Allowed dependencies: `ai` (Vercel AI SDK), `zod`, and the standard library.

### `packages/adapters`

Owns concrete implementations of the interfaces defined in `core`.

Put here:
- LLM provider wrappers (`gemini.ts`, `openai.ts`, `ollama.ts`)
- `SlackAdapter` implementing the core messaging interface
- Memory backends (`FirestoreAgentMemory`, `LanceDbAgentMemory`)
- Domain-specific API clients (GitHub, NewsAPI, scrapers, etc.)

Do not put here:
- Business rules or conversation decisions
- Prompt authoring
- Firebase function handlers
- Use-case orchestration

Adapters translate SDK behavior into port behavior and nothing more.

### `packages/functions`

Owns the Firebase deployment and all serverless entrypoints.

Put here:
- `onRequest` handlers (e.g., Slack events webhook)
- `onSchedule` handlers (e.g., daily digest cron)
- Secret wiring via `defineSecret()`
- Firebase initialization (`initializeApp()`)
- Dependency injection — create adapters, pass them into core workflows

Do not put here:
- Domain logic, agent logic, or persistence logic
- Slack message handling beyond request routing

### `packages/localRun`

Owns the local development runner. Mirrors `functions` but uses Socket Mode and local storage.

Put here:
- Socket Mode bootstrapping (`socketMode: true`)
- `.env` loading via `dotenv`
- Local adapter selection (e.g., `LanceDbAgentMemory` instead of Firestore)

Do not put here:
- New business logic or new core abstractions
- Code that belongs in `packages/functions`

---

## Agent Pattern

Agents live in `packages/core/src/agents/<Name>Agent/` and have two files:

```
ChatAgent/
  agent.ts    ← class with a single primary method
  prompt.ts   ← system prompt string, exported separately
```

An agent receives all dependencies through its constructor:

```typescript
class ChatAgent {
  constructor(
    private readonly model: LanguageModel,
    private readonly memory?: IAgentMemory,
    private readonly slack?: ISlackMessaging,
  ) {}

  async generate(params: GenerateParams): Promise<string> { ... }
}
```

Agents use the Vercel AI SDK (`generateText`, `tool()`) for LLM calls and tool dispatch. The agent class itself never imports a concrete SDK — it receives `LanguageModel` and port interfaces.

## Workflow Pattern

Workflows live in `packages/core/src/workflows/` and are plain async functions. They orchestrate one or more agents and return a typed result.

```typescript
export interface HandleSlackMessageParams {
  slack: ISlackMessaging;
  model: LanguageModel;
  memory: IAgentMemory;
  channel: string;
  userMessage: string;
}

export async function handleSlackMessage(params: HandleSlackMessageParams): Promise<void> {
  const agent = new ChatAgent(params.model, params.memory, params.slack);
  // ... orchestration
}
```

The composition root (functions or localRun) creates all concrete adapters, then passes them into the workflow as interface values.

## LLM Provider Interface

Each template defines an `LLMProvider` type in `packages/adapters/src/llm/types.ts`:

```typescript
export interface LLMProvider {
  largeModel: LanguageModel;
  mediumModel: LanguageModel;
  smallModel: LanguageModel;
  embeddingModel?: EmbeddingModel<string>; // required when memory is used
  webSearchTool?: Tool;                    // optional enrichment
}
```

Provider implementations (`gemini.ts`, `openai.ts`, `ollama.ts`) return an object satisfying this interface. The composition root selects the provider; `core` only sees `LanguageModel`.

## Memory System

Templates that use persistent memory (memory-agent, news-agent) implement a two-layer abstraction:

**Store layer** — raw vector persistence:
```typescript
interface IMemoryStore {
  store(entry: MemoryEntry): Promise<void>;
  search(queryEmbedding: number[], limit?: number): Promise<MemoryEntry[]>;
  getRecent(limit?: number): Promise<MemoryEntry[]>;
}
```

**Agent API layer** — high-level recall:
```typescript
interface IAgentMemory {
  recall(limit?: number): Promise<string[]>;
  search(query: string, limit?: number): Promise<string[]>;
  store(content: string, metadata?: Record<string, unknown>): Promise<void>;
}
```

Both interfaces are defined in `packages/core`. Implementations live in `packages/adapters/src/memory/`:

| Backend | Package | Used in |
|---------|---------|---------|
| `LanceDbAgentMemory` | `@lancedb/lancedb` | `localRun` (development) |
| `FirestoreAgentMemory` | `firebase-admin` | `functions` (production) |

## Slack Integration

`SlackAdapter` in `packages/adapters/src/slack/` wraps `@slack/bolt` and exposes only the methods the core needs:

```typescript
interface ISlackMessaging {
  sendMessage(channel: string, text: string, threadTs?: string): Promise<void>;
  addReaction(channel: string, ts: string, reaction: string): Promise<void>;
  getThreadMessages(channel: string, threadTs: string): Promise<SlackMessage[]>;
  resolveMentions(text: string): Promise<string>;
}
```

The same adapter is used in both deployment modes. The receiver differs:

| Mode | Receiver | Transport |
|------|----------|-----------|
| `functions` | `ExpressReceiver` | HTTP webhook on `/events` |
| `localRun` | `SocketModeReceiver` | WebSocket (Socket Mode) |

## Deployment Modes

### Firebase (production)

- Secrets defined with `defineSecret()` from `firebase-functions/params`
- HTTP functions use `onRequest` + `ExpressReceiver`
- Scheduled functions use `onSchedule` with cron expression and timezone
- Memory/CPU configured per function (`memory`, `timeoutSeconds`)

### Local (development)

- Environment loaded from `.env` via `dotenv`
- Slack uses Socket Mode (requires `SLACK_APP_TOKEN`)
- Memory backed by local LanceDB (`./lancedb-data`)
- Run with `pnpm local:run`

## Toolchain

| Tool | Version | Role |
|------|---------|------|
| pnpm | 10.x | Package manager and workspace |
| TypeScript | 6.x | Type checking |
| tsdown | 0.21.x | Build (ESM output) |
| Biome | 2.x | Linting and formatting |
| mise | — | Runtime version management |

Module format is ESM throughout. All imports within the monorepo use the path aliases defined in `tsconfig.base.json` (`@{name}/core`, `@{name}/adapters`) and resolve to the TypeScript source, not the built output.

## What Goes Where

| Task | Location |
|------|----------|
| New agent | `packages/core/src/agents/<Name>Agent/` |
| New prompt | Next to the agent in the same folder |
| New workflow | `packages/core/src/workflows/` |
| New port interface | `packages/core/src/types/` |
| New LLM provider | `packages/adapters/src/llm/` |
| New external API client | `packages/adapters/src/<service>/` |
| New memory backend | `packages/adapters/src/memory/` |
| New Slack behavior | `packages/adapters/src/slack/` |
| New Firebase function | `packages/functions/src/functions/` |
| Shared bootstrap helpers | `packages/functions/src/shared/` |
| Local-only runner changes | `packages/localRun/src/` |

## Adding a Feature (Change Order)

1. Define or extend the port interface in `packages/core`
2. Implement the adapter(s) in `packages/adapters`
3. Wire the concrete implementation in `packages/functions` and `packages/localRun`
4. Export the new stable API from the relevant `index.ts`
5. Run `pnpm typecheck` and `pnpm build` for affected packages

## Guardrails

- No Firebase, Slack Bolt, Firestore, or LanceDB imports in `packages/core`
- No `process.env` access in `packages/core`
- No business rules in `packages/adapters`, `packages/functions`, or `packages/localRun`
- No direct writes to outer systems from core code
- No imports from another package's `dist/` output — always import from the source alias
- No duplicated orchestration logic between `functions` and `localRun`
