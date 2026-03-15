# Solito

TypeScript CLI that wraps AI agent execution (claude, codex, etc).

## Structure

- `src/cli.ts` - Entry point: parses command, loads config, validates command names against built-in subcommands, dispatches to handler. For named commands, writes resolved prompt to file and injects `max_turn_time_minutes`. `buildDynamicBuiltIns()` reads `--spec` file and `--prompt` text into template variables
- `src/args.ts` - Subcommand routing (prompt, config, ui, help, or command name as first arg). `prompt` subcommand sets `rawPrompt: true`. Supports `--spec`, `--prompt`/`-p`, `--report-metrics`, `--api-host`, `--api-port` flags. `UiCommand` kind for `ui` subcommand with `--host`/`--port`
- `src/agents/agent.ts` - `Agent` interface, `AgentHandle` (includes `iterationComplete` flag), `AgentRunOptions`
- `src/agents/registry.ts` - Agent factory registry with `registerAgent()` / `getAgent()`
- `src/agents/claude.ts` - Claude agent: streams JSON, detects `=== ITERATION COMPLETE ===` marker, kills process tree on completion
- `src/agents/codex.ts` - Codex agent: `codex --prompt <prompt>`
- `src/agents/prompt-builder.ts` - Builds autonomous agent system prompt: loop context, test execution strategy, progress file, priority-ordered tasks, coverage/complexity metrics
- `src/commands/run-command.ts` - Executes agent in continuation loop with progress file persistence, 3-stage escalating timeout warnings (soft/urgent/kill) sent to agent via stdin, minute ticker, Windows-aware signal forwarding
- `src/commands/config-command.ts` - Displays effective config as YAML plus project overrides section
- `src/commands/ui-command.ts` - `executeUiCommand()`: starts metrics dashboard server, waits for SIGINT/SIGTERM
- `src/commands/command-resolver.ts` - `CommandResolver` interface, `DefaultCommandResolver`: resolves named commands to prompt file content with variable interpolation. Supports inline prompt: `solito <command> '<text>'` extracts first word as command name, rest as `inlinePrompt`
- `src/config/config.ts` - `SolitoConfig`, `AgentConfig`, `LoopConfig`, `StaleThresholds`, `CommandConfig`, `CommandVariables`, `ConfigLoader` types
- `src/config/config-schema.ts` - Zod schema validation for config (including commands)
- `src/config/default-config.ts` - Default config values and merge logic (includes `quality`, `build`, `hunt-bugs`, and `generate-spec` commands)
- `src/config/config-merger.ts` - `mergeProjectConfig()`: deep merges project config overrides into global config
- `src/config/project-config-loader.ts` - `ProjectConfigLoader` interface, `DefaultProjectConfigLoader`: loads `.solito/config.yaml` from CWD
- `src/config/yaml-config-loader.ts` - Loads/creates `$HOME/.solito/config.yaml` with validation, integrates project config
- `src/interpolation/variable-resolver.ts` - `VariableResolver` interface, `DefaultVariableResolver`: interpolates `${var:...}` and `${env:...}` tokens
- `src/workspace/workspace-initializer.ts` - `WorkspaceInitializer` interface, `DefaultWorkspaceInitializer`: creates `.solito/` dir, empty `config.yaml`, and `.solito/commands/{name}/` work dirs
- `prompts/quality.md` - Quality guardian prompt template with `${var:command_work_dir}` for persistence
- `prompts/build.md` - Build agent prompt: two-phase approach per spec (Phase 1: write all failing tests, Phase 2: implement to pass them). Terminates when done and suggests `solito quality`
- `prompts/hunt-bugs.md` - Bug hunter prompt: scans code for bugs, writes failing tests, fixes them. Supports `${var:spec_section}` and `${var:user_guidance_section}` from CLI `--spec`/`--prompt` flags. Terminates after `max_loops_without_bugs` consecutive loops with no bugs found
- `prompts/generate-spec.md` - Spec generator prompt: analyzes project structure and generates actionable spec files in `specs/` directory. Receives feature description via `${var:user_guidance_section}` (from inline prompt or `--prompt` flag)
- `src/stream/events.ts` - Claude CLI stream-json event types (NDJSON)
- `src/stream/parser.ts` - `StreamParser` interface, `JsonStreamParser` (logs parse errors)
- `src/stream/formatter.ts` - `StreamFormatter` interface, `ConsoleStreamFormatter` (verbose mode, known-tool formatting, markdown rendering)
- `src/stream/tool-formatter.ts` - Pretty-prints known tool inputs (Agent, Bash) with type-guarded JSON parsing
- `src/stream/markdown-renderer.ts` - `MarkdownRenderer` interface, `TerminalMarkdownRenderer` (marked + marked-terminal)
- `src/constants.ts` - Shared constants (ANSI codes, icons, separator, preview lengths, ITERATION_COMPLETE_MARKER)
- `src/process/kill-process-tree.ts` - Cross-platform process tree killing (taskkill /T on Windows, process group on Unix)
- `src/filesystem/filesystem.ts` - `FileSystem` interface (readFile, writeFile, exists, mkdirRecursive, listDirectories)
- `src/filesystem/default-filesystem.ts` - Real `fs/promises` implementation (ENOENT-specific error handling)
- `src/process/spawner.ts` - `ProcessSpawner` interface
- `src/process/default-spawner.ts` - Real `child_process.spawn` implementation
- `src/process/streaming-spawner.ts` - `StreamingProcessSpawner` interface (line-by-line), `StdinMode` type (inherit/ignore/pipe)
- `src/process/default-streaming-spawner.ts` - Real streaming spawner with NDJSON buffering
- `src/process/output-buffer.ts` - Memory-limited output buffer (50 MB cap)
- `src/util/command.ts` - `commandExists()` utility
- `src/util/paths.ts` - Config directory/file path helpers
- `src/util/logger.ts` - `Logger` interface, `ConsoleLogger` implementation
- `src/ui/tsv-parser.ts` - `TsvParser` interface, `DefaultTsvParser`: parses TSV content into typed rows
- `src/ui/tsv-row-transformer.ts` - `TsvRowTransformer` interface, `DefaultTsvRowTransformer`: converts TsvRow[] to MetricReport[] with synthetic instanceId and numeric extraction
- `src/ui/metrics-store.ts` - `MetricsStore` interface, `InMemoryMetricsStore`: stores metric reports per-instance with `getByInstance()`/`getInstances()`
- `src/ui/ui-html.ts` - Builds dashboard HTML page (Tailwind + jQuery + Chart.js from CDN)
- `src/ui/ui-charts-js.ts` - Chart.js initialization script builder for dashboard charts; polls `/api/commands` + `/api/tsv/{command}` to auto-display TSV data
- `src/ui/ui-handlers.ts` - `UiHandlers`: request handlers for dashboard, metrics, instances, TSV, and available commands endpoints
- `src/ui/ui-routes.ts` - `RouteDispatcher`: maps HTTP method+path to handlers
- `src/ui/ui-server.ts` - `HttpServer` interface, `UiServer`: Node.js `http` server wrapping route dispatcher
- `src/metrics/metrics-reporter.ts` - `MetricsReporter` interface, `HttpMetricsReporter`: `ping()` validates server reachability, `report()` POSTs metric payloads
- `src/metrics/metrics-watcher.ts` - `MetricsWatcher` interface, `TsvMetricsWatcher`: polls TSV file for new rows and reports via `MetricsReporter`
- `src/metrics/stale-metrics-checker.ts` - `StaleMetricsChecker` interface, `TsvStaleMetricsChecker`: two-tier stale warning system. Tracks phase (normal→warned_once→warned_twice→stop). First warning injects "try different approach" into continuation prompt, second warning escalates, then stops. Resets on improvement. Configurable thresholds via `loop.stale: { first_warning, second_warning, stop }` (all default 2)
- `src/test/` - Shared test utilities (mock-child-process, mock-filesystem, mock-agent, mock-logger)

## Commands

- `npm run build` - Compile TypeScript
- `npm test` - Run Jest tests
- `npm run dev -- <command>` - Run without building

## Adding Agents

1. Implement `Agent` interface in `src/agents/<name>.ts`
2. Call `registerAgent()` in `src/agents/registry.ts`
3. Add agent entry in `$HOME/.solito/config.yaml`
