# Solito

CLI wrapper for running AI agents like Claude, Codex, and more. Provides a unified interface to execute different AI coding agents with a single command.

## Installation

```bash
npm install
npm run build
npm link   # makes 'solito' available globally
```

## Usage

```bash
solito <command> [options]
```

### Commands

| Command | Description |
|---|---|
| `run [options] <command\|prompt>` | Run an agent with a named command or raw prompt |
| `config` | Show current configuration |

### Options (for `run`)

| Option | Description |
|---|---|
| `--agent`, `-a` | Agent to use (default: from config). Available: `claude`, `codex` |
| `--verbose`, `-v` | Show additional metadata (message IDs, models, tokens, costs, session info) |
| `--help`, `-h` | Show help message |
| `--` | Separator for passthrough args sent directly to the underlying agent CLI |

### Examples

```bash
# Run a named command (resolves prompt from config)
solito run quality

# Run with Claude (default)
solito run 'refactor the auth module'

# Specify agent explicitly
solito run --agent=claude 'fix the login bug'

# Use Codex
solito run -a codex 'add unit tests'

# Implicit run (no subcommand)
solito 'fix the login bug'

# Verbose mode (show metadata)
solito run -v 'fix the bug'

# Pass flags through to the underlying agent
solito run 'fix the bug' -- --max-turns 5

# Combine flags
solito run -a claude -v 'refactor auth' -- --verbose

# Show current config
solito config
```

## Configuration

Solito reads its config from `$HOME/.solito/config.yaml`. On first run, a default config is created automatically.

```yaml
default_agent: claude
loop:
  max_turn_time_minutes: 5
agents:
  claude:
    type: claude
    # Optional: appended after the auto-generated autonomous agent prompt
    append_system_prompt: |
      Additional instructions here
```

### Config Fields

| Field | Description |
|---|---|
| `default_agent` | Agent to use when `--agent` is not specified |
| `loop.max_turn_time_minutes` | Maximum time per loop iteration in minutes (enforced with process timeout) |
| `agents.<name>.type` | Agent type (must match a registered agent) |
| `agents.<name>.append_system_prompt` | Extra system prompt appended after the default autonomous agent prompt |
| `commands.<name>.prompt` | Path to a prompt file (supports `${var:...}` and `${env:...}` interpolation) |
| `commands.<name>.variables` | Variables available for interpolation in the prompt path and content |

### Named Commands

Define reusable commands in your config. When you run `solito run <name>`, if `<name>` matches a key in `commands`, solito resolves the prompt file path, reads it, interpolates variables, and uses the result as the prompt.

```yaml
commands:
  quality:
    prompt: "${var:solito_root_dir}/prompts/quality.md"
    variables:
      thresholds:
        min_coverage_pct_enhancement_per_loop: 0.5
      max_loops_without_enhancement: 3
```

**Variable interpolation:**

- `${var:solito_root_dir}` - resolves to solito's installation directory
- `${var:command_work_dir}` - resolves to `.solito/commands/<command-name>/` in the current directory (created automatically)
- `${var:key}` - resolves from the command's `variables` config
- `${var:nested.key}` - dot-path lookup in nested variables
- `${env:HOME}` - resolves from environment variables

Variables are interpolated in both the prompt **path** and the file **content**.

Built-in commands included by default: `quality` and `build`.

### Build Command

The `build` command implements features from ordered spec files using test-driven development.

```bash
solito run build
```

**Setup:**
1. Create a `specs/` directory in your project root (configurable via `specs_dir` variable).
2. Add ordered markdown spec files: `01-feature.md`, `02-feature.md`, etc.
3. Run `solito run build`.

**Spec file format:**
```markdown
# Feature: User Authentication

## Requirements
- Users can register with email and password

## Acceptance Criteria
- POST /register with valid email/password returns 201 with user ID
- POST /register with duplicate email returns 409

## Constraints (optional)
- Must not add external authentication libraries
```

The agent reads specs in order, implements each test-first, and commits only when build passes, linter is clean, all tests pass, and coverage or complexity measurably improve. State (progress, metrics, logs) is persisted in `.solito/commands/build/`.

**Variables:**
| Variable | Default | Description |
|---|---|---|
| `specs_dir` | `specs` | Project-level directory containing spec files |
| `max_consecutive_failures` | `5` | Rollbacks before marking a spec as blocked |
| `thresholds.min_coverage_pct_enhancement_per_loop` | `0.5` | Minimum coverage increase per commit |
| `max_loops_without_enhancement` | `3` | Consecutive no-improvement loops before switching approach |

### Workspace Directory

When running any command, solito automatically creates a `.solito/` directory in the current working directory with an empty `config.yaml` for project-level overrides. When running a named command, it also creates `.solito/commands/<command-name>/` as a persistent working directory for that command's state (metrics, logs, etc.).

### Project Config

Place a `.solito/config.yaml` file in your project directory to override global config per-project. Project config is deep-merged with global config (project values take precedence).

```yaml
# .solito/config.yaml in your project root
default_agent: codex
commands:
  lint:
    prompt: "./prompts/lint.md"
```

### Autonomous Agent Prompt

When running the Claude agent, solito automatically generates a system prompt that:

- Tells Claude it is an autonomous agent running in a loop
- Specifies the maximum loop iteration duration (from `loop.max_turn_time_minutes`)
- Instructs Claude to save relevant information to memory between iterations
- Includes the user's task/prompt

If `append_system_prompt` is set in the agent config, it is appended after the generated prompt.

## Claude Agent Output

The Claude agent uses `--output-format stream-json` to stream structured JSON from the Claude CLI. Output is parsed and formatted in real-time:

- **Text content**: streamed directly to the terminal
- **Tool usage**: displayed with tool name highlighted in cyan
- **Tool input**: for known tools (Agent, Bash), parsed and shown with structured details; for other tools, shown as raw dim text
- **Thinking**: shown in dim text
- **Errors**: displayed in red
- **Cost**: shown at the end of execution

### Verbose Mode (`--verbose` / `-v`)

When enabled, additional metadata is displayed in dim yellow:

- **message_start**: message ID and model name
- **message_delta**: stop reason and output token count
- **result**: session ID, duration, API time, and total cost
- **system messages**: system event type and message

## Development

```bash
npm run dev -- run 'your prompt'  # Run without building
npm run build                      # Compile TypeScript
npm test                           # Run tests
```

## Project Structure

```
src/
├── cli.ts                  # Entry point
├── args.ts                 # Subcommand routing
├── agents/
│   ├── agent.ts            # Agent interface + AgentRunOptions
│   ├── registry.ts         # Agent registry
│   ├── claude.ts           # Claude agent (streaming JSON)
│   ├── codex.ts            # Codex agent
│   └── prompt-builder.ts   # Autonomous agent system prompt builder
├── commands/
│   ├── run-command.ts      # Run command handler
│   ├── config-command.ts   # Config command handler
│   └── command-resolver.ts # Named command resolution + prompt file loading
├── config/
│   ├── config.ts           # Config types + ConfigLoader interface
│   ├── config-schema.ts    # Zod schema validation
│   ├── config-merger.ts    # Project config merge logic
│   ├── default-config.ts   # Default values + merge logic
│   ├── project-config-loader.ts  # .solito/config.yaml project config loader
│   └── yaml-config-loader.ts  # YAML file loader with validation
├── interpolation/
│   └── variable-resolver.ts  # ${var:...} and ${env:...} interpolation
├── workspace/
│   └── workspace-initializer.ts  # .solito/ dir + command work dir creation
├── stream/
│   ├── events.ts           # Claude CLI stream-json event types
│   ├── parser.ts           # NDJSON line parser (with error logging)
│   ├── formatter.ts        # Console stream formatter
│   └── tool-formatter.ts   # Known tool input pretty-printing
├── filesystem/
│   ├── filesystem.ts       # FileSystem interface
│   └── default-filesystem.ts  # Real fs implementation
├── process/
│   ├── spawner.ts          # ProcessSpawner interface
│   ├── default-spawner.ts  # Real spawner implementation
│   ├── streaming-spawner.ts     # StreamingProcessSpawner interface
│   ├── default-streaming-spawner.ts  # Line-by-line streaming spawner
│   └── output-buffer.ts    # Memory-limited output buffer
├── test/                   # Shared test utilities
│   ├── mock-agent.ts
│   ├── mock-child-process.ts
│   └── mock-filesystem.ts
└── util/
    ├── command.ts          # Command existence check
    └── paths.ts            # Config path helpers
```
