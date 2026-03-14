# Solito

TypeScript CLI that wraps AI agent execution (claude, codex, etc).

## Structure

- `src/cli.ts` - Entry point: parses command, loads config, validates command names against built-in subcommands, dispatches to handler. For named commands, writes resolved prompt to file and injects `max_turn_time_minutes`
- `src/args.ts` - Subcommand routing (prompt, config, help, or command name as first arg). `prompt` subcommand sets `rawPrompt: true`. No `run` subcommand — commands are invoked directly (e.g. `solito quality`)
- `src/agents/agent.ts` - `Agent` interface, `AgentHandle` (includes `iterationComplete` flag), `AgentRunOptions`
- `src/agents/registry.ts` - Agent factory registry with `registerAgent()` / `getAgent()`
- `src/agents/claude.ts` - Claude agent: streams JSON, detects `=== ITERATION COMPLETE ===` marker, kills process tree on completion
- `src/agents/codex.ts` - Codex agent: `codex --prompt <prompt>`
- `src/agents/prompt-builder.ts` - Builds autonomous agent system prompt: loop context, test execution strategy, progress file, priority-ordered tasks, coverage/complexity metrics
- `src/commands/run-command.ts` - Executes agent in continuation loop with progress file persistence, 3-stage escalating timeout warnings (soft/urgent/kill) sent to agent via stdin, minute ticker, Windows-aware signal forwarding
- `src/commands/config-command.ts` - Displays current config as YAML
- `src/commands/command-resolver.ts` - `CommandResolver` interface, `DefaultCommandResolver`: resolves named commands to prompt file content with variable interpolation
- `src/config/config.ts` - `SolitoConfig`, `AgentConfig`, `LoopConfig`, `CommandConfig`, `CommandVariables`, `ConfigLoader` types
- `src/config/config-schema.ts` - Zod schema validation for config (including commands)
- `src/config/default-config.ts` - Default config values and merge logic (includes `quality` and `build` commands)
- `src/config/config-merger.ts` - `mergeProjectConfig()`: deep merges project config overrides into global config
- `src/config/project-config-loader.ts` - `ProjectConfigLoader` interface, `DefaultProjectConfigLoader`: loads `.solito/config.yaml` from CWD
- `src/config/yaml-config-loader.ts` - Loads/creates `$HOME/.solito/config.yaml` with validation, integrates project config
- `src/interpolation/variable-resolver.ts` - `VariableResolver` interface, `DefaultVariableResolver`: interpolates `${var:...}` and `${env:...}` tokens
- `src/workspace/workspace-initializer.ts` - `WorkspaceInitializer` interface, `DefaultWorkspaceInitializer`: creates `.solito/` dir, empty `config.yaml`, and `.solito/commands/{name}/` work dirs
- `prompts/quality.md` - Quality guardian prompt template with `${var:command_work_dir}` for persistence
- `prompts/build.md` - Build agent prompt: implements features from ordered spec files via test-driven loops
- `src/stream/events.ts` - Claude CLI stream-json event types (NDJSON)
- `src/stream/parser.ts` - `StreamParser` interface, `JsonStreamParser` (logs parse errors)
- `src/stream/formatter.ts` - `StreamFormatter` interface, `ConsoleStreamFormatter` (verbose mode, known-tool formatting, markdown rendering)
- `src/stream/tool-formatter.ts` - Pretty-prints known tool inputs (Agent, Bash) with type-guarded JSON parsing
- `src/stream/markdown-renderer.ts` - `MarkdownRenderer` interface, `TerminalMarkdownRenderer` (marked + marked-terminal)
- `src/constants.ts` - Shared constants (ANSI codes, icons, separator, preview lengths, ITERATION_COMPLETE_MARKER)
- `src/process/kill-process-tree.ts` - Cross-platform process tree killing (taskkill /T on Windows, process group on Unix)
- `src/filesystem/filesystem.ts` - `FileSystem` interface
- `src/filesystem/default-filesystem.ts` - Real `fs/promises` implementation (ENOENT-specific error handling)
- `src/process/spawner.ts` - `ProcessSpawner` interface
- `src/process/default-spawner.ts` - Real `child_process.spawn` implementation
- `src/process/streaming-spawner.ts` - `StreamingProcessSpawner` interface (line-by-line), `StdinMode` type (inherit/ignore/pipe)
- `src/process/default-streaming-spawner.ts` - Real streaming spawner with NDJSON buffering
- `src/process/output-buffer.ts` - Memory-limited output buffer (50 MB cap)
- `src/util/command.ts` - `commandExists()` utility
- `src/util/paths.ts` - Config directory/file path helpers
- `src/util/logger.ts` - `Logger` interface, `ConsoleLogger` implementation
- `src/test/` - Shared test utilities (mock-child-process, mock-filesystem, mock-agent, mock-logger)

## Commands

- `npm run build` - Compile TypeScript
- `npm test` - Run Jest tests
- `npm run dev -- <command>` - Run without building

## Adding Agents

1. Implement `Agent` interface in `src/agents/<name>.ts`
2. Call `registerAgent()` in `src/agents/registry.ts`
3. Add agent entry in `$HOME/.solito/config.yaml`
