# Solito

CLI that wraps AI agents (Claude, Codex, etc.) in a continuation loop with automatic progress tracking, timeout management, stale-detection, and a real-time metrics dashboard.

## Installation

```bash
npm install -g solito
```

Requires [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) or [Codex CLI](https://github.com/openai/codex) installed and available in PATH.

## Quick Start

```bash
solito quality                    # Improve test coverage and code quality
solito build                      # Build features from spec files
solito hunt-bugs                  # Find and fix bugs
solito generate-spec 'Add /api/users endpoint'
solito prompt 'refactor the auth module'
solito config                     # View effective configuration
```

## Built-in Commands

| Command         | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `quality`       | Continuously improves test coverage, reduces complexity, and fixes linting  |
| `build`         | Builds features from spec files using test-driven development               |
| `hunt-bugs`     | Scans code for bugs, writes failing tests, fixes them                       |
| `generate-spec` | Analyzes a project and generates actionable spec files in `specs/`          |

## CLI Usage

```
solito <command> [options]

Subcommands:
  <command-name>               Run a named command (built-in or custom)
  prompt <prompt>              Run an agent with a raw prompt
  config                       Show current configuration
  ui                           Start the metrics dashboard
  help                         Show help

Options:
  --agent, -a <name>     Agent to use (default: from config)
  --verbose, -v          Show agent stream metadata
  --spec <path>          Spec file for additional context
  --prompt, -p <text>    Additional guidance for the agent
  --report-metrics       Send metrics to a running dashboard
  --api-host <host>      Metrics server host (default: localhost)
  --api-port <port>      Metrics server port (default: 19191)
  --help, -h             Show help
  --                     Pass remaining flags to the underlying agent
```

### Examples

```bash
# Combine spec and guidance
solito hunt-bugs --spec specs/api.md --prompt 'focus on auth module'

# Choose agent, verbose output
solito quality --agent=claude -v

# Pass flags through to the underlying agent CLI
solito quality -- --max-turns 5

# Inline prompt with generate-spec
solito generate-spec 'Add new REST endpoint for user profiles'
```

## Metrics Dashboard

```bash
# Terminal 1: Start dashboard
solito ui
solito ui --port 8080

# Terminal 2: Run with metrics reporting
solito quality --report-metrics
```

The dashboard displays real-time charts for coverage, complexity, linter issues, failed tests, and other metrics from each command's `log.tsv`. It auto-discovers TSV files from previous runs, deduplicates instances by project directory, and supports pagination.

**UI options:**

| Option           | Default   | Description                 |
|------------------|-----------|-----------------------------|
| `--host <host>`  | `0.0.0.0` | Dashboard bind address      |
| `--port <port>`  | `19191`   | Dashboard port              |

## Configuration

Solito creates `~/.solito/config.yaml` on first run. Project-level overrides go in `.solito/config.yaml` at the project root (deep-merged, project values take precedence).

```yaml
default_agent: claude

loop:
  max_turn_time_minutes: 15
  continue_prompt: "Continue where you left off."
  stale:
    first_warning: 2    # stale iterations before first warning
    second_warning: 2    # additional stale iterations before second warning
    stop: 2              # additional stale iterations before auto-stop

agents:
  claude:
    type: claude
    append_system_prompt: "Be concise."

commands:
  my-command:
    prompt: path/to/prompt.md
    variables:
      key: value
    append_system_prompt: "Extra instructions."
```

### Stale Iteration Detection

Solito monitors metrics after each loop iteration. If no metric improves for consecutive iterations, a two-tier warning system activates:

1. **First warning** (default: after 2 stale loops) -- instructs the agent to try radically different approaches and document what was tried in the progress file.
2. **Second warning** (default: 2 more stale loops) -- escalated final warning before auto-stop.
3. **Stop** (default: 2 more stale loops) -- halts the loop with an explanation.

If the agent improves any metric after a warning, the stale check resets completely. Metrics where lower is better (complexity, lint issues, failed tests, etc.) are detected automatically.

### Timeout Warnings

Each iteration has a configurable time limit (`max_turn_time_minutes`). The agent receives staged warnings via stdin:

- **Soft** at 5 minutes remaining -- asks agent to wrap up
- **Urgent** at 2 minutes remaining -- demands immediate commit or rollback
- **Kill** at the time limit -- force-kills and restarts for the next loop

### Variable Interpolation

Prompts support `${var:...}` and `${env:...}` tokens:

| Variable                    | Description                                              |
|-----------------------------|----------------------------------------------------------|
| `${var:solito_root_dir}`    | Solito's installation directory                          |
| `${var:command_work_dir}`   | `.solito/commands/<command>/` in the current project     |
| `${var:key}`                | Value from the command's `variables` config              |
| `${var:nested.key}`         | Dot-path lookup in nested variables                      |
| `${env:HOME}`               | Environment variable                                     |

### Build Command

Implements features from ordered spec files using test-driven development:

```bash
solito build
```

1. Create `specs/` directory with ordered markdown files (`01-feature.md`, `02-feature.md`, ...).
2. The agent processes each spec in two phases: writes all failing tests (Phase 1), then implements code to pass them (Phase 2).
3. Commits only when build passes, linter is clean, tests pass, and metrics improve.

### Hunt Bugs Command

```bash
solito hunt-bugs
solito hunt-bugs --spec specs/api.md
solito hunt-bugs --prompt 'focus on error handling'
solito hunt-bugs --spec specs/api.md -p 'check auth module'
```

Scans code for bugs using multiple strategies, writes a failing test for each bug found, fixes it, and commits. Terminates after `max_loops_without_bugs` (default: 3) consecutive loops with no bugs found.

## Adding Agents

1. Implement the `Agent` interface in `src/agents/<name>.ts`
2. Register with `registerAgent()` in `src/agents/registry.ts`
3. Add an entry under `agents` in your `config.yaml`

## Development

```bash
npm install
npm run build              # Compile TypeScript
npm test                   # Run tests
npm run dev -- quality     # Run without building
```

## License

MIT
