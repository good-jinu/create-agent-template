# Architecture Conventions

This repository uses a hexagonal architecture with a single application core and thin outer adapters.

## Layer Map

```text
packages/core      -> application core
packages/adapters  -> infrastructure adapters
packages/functions -> Firebase composition root
packages/localRun  -> local composition root
packages/workflow-eval -> eval/test harness for core workflows
```

## Responsibility Boundaries

### `packages/core`

Owns all business rules and orchestration.

Put here:

- Agents
- Workflows / use cases
- Domain-facing types
- Port interfaces
- Prompt text used by agents

Do not put here:

- Firebase code
- Slack SDK code
- Firestore / LanceDB code
- Environment variable access
- Provider selection logic
- Runtime bootstrap code

Core code must depend only on:

- Standard library
- Pure application dependencies such as `ai` and `zod`
- Types from the same package

Core code may define interfaces for external systems, but it must not implement them.

### `packages/adapters`

Owns concrete implementations of core ports.

Put here:

- Slack adapter implementations
- LLM provider setup
- Firestore persistence adapters
- LanceDB persistence adapters
- SDK-specific wrappers

Do not put here:

- Business rules
- Conversation decisions
- Prompt authoring
- Use-case orchestration
- Firebase function handlers

Adapters may depend on `packages/core`, but `packages/core` must never depend on adapters.

### `packages/functions`

Owns Firebase deployment and request/schedule entrypoints.

Put here:

- Firebase `onRequest` and `onSchedule` handlers
- Secret wiring
- Environment bootstrapping
- Dependency injection / composition

Do not put here:

- Domain logic
- Agent logic
- Persistence logic
- Slack message handling logic beyond wiring

This package should assemble the application by importing core use cases and adapter implementations, then pass concrete dependencies into the core.

### `packages/localRun`

Owns local-only runtime wiring.

Put here:

- Socket Mode bootstrapping
- Local env loading
- Local adapter selection
- Local memory store setup

Do not put here:

- New business logic
- New core abstractions
- Code that belongs in `packages/functions`

### `packages/workflow-eval`

Owns the local evaluation harness for core workflows.

Put here:

- Scenario runners for core workflows
- Mock implementations used only for workflow evaluation
- CSV or other fixture data for eval cases
- Local-only utilities for loading eval fixtures

Do not put here:

- Core business rules
- Production adapter implementations
- Firebase entrypoints
- Slack event handling for production

This package may depend on `packages/core` and `packages/adapters` for composition, but it must not introduce new business logic that belongs in `packages/core`.

## Dependency Direction

The allowed dependency direction is:

```text
functions/localRun -> adapters -> core
functions/localRun -> core
adapters -> core
core -> (nothing from adapters/functions/localRun)
workflow-eval -> adapters -> core
workflow-eval -> core
```

Never introduce reverse imports.

Never import from another package's `dist/` output.

## What Goes Where

### New use case

Create it in `packages/core/src/workflows`.

If it is an application-level orchestration, it belongs in core even if it talks to Slack or memory through interfaces.

### New agent

Create it in `packages/core/src/agents/<Name>Agent`.

Organize the agent folder as follows:
- `agent.ts`: The main agent class and orchestration logic.
- `tools.ts`: Tool definitions and factory functions. Tools should use callbacks for side effects to keep the tools pure of agent state.
- `prompt.ts`: The system prompt and identity of the agent.

Keep the prompt and tool definitions next to the agent in the same folder.

### New port interface

Add it to `packages/core/src/types` or the most specific port module under `packages/core/src`.

Prefer the narrowest interface possible.

### New Slack integration behavior

Implement the Slack SDK details in `packages/adapters/src/slack`.

Expose only the minimal methods the core needs.

### New memory backend

Implement the backend in `packages/adapters/src/memory`.

Keep the interface in `packages/core`.

### New LLM provider or tool

Implement provider setup in `packages/adapters/src/llm`.

Select the provider in the composition root, not in core.

### New Firebase endpoint

Add it in `packages/functions/src/functions`.

Put shared bootstrap helpers in `packages/functions/src/shared`.

### New local runner behavior

Add it in `packages/localRun/src`.

### New workflow eval case

Add it in `packages/workflow-eval/src/cases`.

### New workflow eval mock or fixture helper

Add it in `packages/workflow-eval/src/mockModules` or `packages/workflow-eval/src/utils`.

## File-Level Rules

- `packages/core/src/index.ts` is the public core API surface. Re-export only stable, intentional entrypoints.
- `packages/adapters/src/index.ts` is the public adapter API surface. Re-export only adapter entrypoints that are safe for composition roots.
- Keep `functions/src/index.ts` and `localRun/src/index.ts` thin. They should only re-export or bootstrap.
- Prompts stay beside the agent that uses them.
- Port interfaces stay beside the use case that consumes them unless the same port is shared broadly.

## Implementation Rules

- Core code must be written against interfaces, not concrete SDKs.
- Adapters must stay thin. They translate SDK behavior into port behavior and nothing more.
- Composition roots must wire dependencies; they must not make business decisions.
- If a change needs a new external dependency, add it in the outermost package that actually uses it.
- If a feature requires a new capability across layers, add the port first in core, then the adapter, then the composition root.

## Change Workflow

When adding a feature, follow this order:

1. Define or extend the core port or use case.
2. Implement the adapter(s) needed to satisfy the port.
3. Wire the concrete implementation in `packages/functions` or `packages/localRun`.
4. Export the new stable API from the relevant `index.ts`.
5. Run typecheck and build for the affected packages.

## Architecture Guardrails

- No Firebase imports in `packages/core`.
- No Slack Bolt imports in `packages/core`.
- No Firestore or LanceDB imports in `packages/core`.
- No `process.env` access in `packages/core`.
- No business rules in `packages/adapters`.
- No business rules in `packages/functions` or `packages/localRun`.
- No direct writes to outer systems from core code.
- No duplicated orchestration logic across `functions` and `localRun`.

## Practical Reading Of The Current Code

- `packages/core` contains the agents and workflows that decide what to do.
- `packages/adapters` contains the Slack, LLM, and memory implementations that make those workflows work in the real world.
- `packages/functions` is the Firebase entrypoint that initializes secrets, creates adapters, and calls core workflows.
- `packages/localRun` is the local Socket Mode entrypoint that does the same kind of wiring for development.

If a change does not fit one of those roles, stop and move it to the correct layer.
