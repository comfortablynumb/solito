import { listAgentNames } from "./agents/registry";
import { listBuiltInCommandNames } from "./config/default-config";

export interface RunCommand {
  kind: "run";
  agentName?: string;
  prompt: string;
  rawPrompt: boolean;
  verbose: boolean;
  spec?: string;
  extraPrompt?: string;
  passthrough: string[];
  metricsBaseUrl: string;
  forceVerify: boolean;
}

export interface UiCommand {
  kind: "ui";
  host: string;
  port: number;
}

export type CliCommand =
  | RunCommand
  | UiCommand
  | { kind: "config" }
  | { kind: "version" }
  | { kind: "help" };

const BUILT_IN_SUBCOMMANDS = ["prompt", "config", "help", "ui", "version"];

export function listBuiltInSubcommands(): string[] {
  return BUILT_IN_SUBCOMMANDS;
}

export function parseArgs(argv: string[]): CliCommand {
  const args = argv.slice(2);

  if (args.length === 0) {
    return { kind: "help" };
  }

  const subcommand = args[0];

  if (subcommand === "config") {
    return { kind: "config" };
  }

  if (subcommand === "version") {
    return { kind: "version" };
  }

  if (subcommand === "ui") {
    return parseUiArgs(args.slice(1));
  }

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    return { kind: "help" };
  }

  if (subcommand === "prompt") {
    return parseRunArgs(args.slice(1), true);
  }

  // First arg is a command name — pass it as the prompt for resolution
  return parseRunArgs(args, false);
}

interface RunArgState {
  agentName?: string;
  verbose: boolean;
  spec?: string;
  extraPrompt?: string;
  metricsBaseUrl: string;
  forceVerify: boolean;
  positional: string[];
}

function createDefaultRunArgState(): RunArgState {
  return {
    verbose: false,
    metricsBaseUrl: "localhost:19191",
    forceVerify: false,
    positional: [],
  };
}

type FlagResult = { skip: number } | { help: true };

function handleValueFlag(
  args: string[], i: number, arg: string, flags: string[], equalPrefix: string,
  setter: (value: string) => void,
): FlagResult | null {
  if (flags.includes(arg)) {
    setter(requireNextArg(args, i, arg));
    return { skip: 1 };
  }

  if (arg.startsWith(equalPrefix)) {
    setter(arg.split("=").slice(1).join("="));
    return { skip: 0 };
  }

  return null;
}

interface ValueFlagDef {
  flags: string[];
  equalPrefix: string;
  setter: (value: string) => void;
}

function buildValueFlagDefs(state: RunArgState): ValueFlagDef[] {
  return [
    { flags: ["--agent", "-a"], equalPrefix: "--agent=", setter: (v) => { state.agentName = v; } },
    { flags: ["--spec"], equalPrefix: "--spec=", setter: (v) => { state.spec = v; } },
    { flags: ["--prompt", "-p"], equalPrefix: "--prompt=", setter: (v) => { state.extraPrompt = v; } },
    { flags: ["--report-metrics-base-url"], equalPrefix: "--report-metrics-base-url=", setter: (v) => { state.metricsBaseUrl = v; } },
  ];
}

function processBooleanFlag(arg: string, state: RunArgState): FlagResult | null {
  if (arg === "--verbose" || arg === "-v") {
    state.verbose = true;
    return { skip: 0 };
  }

  if (arg === "--force-verify") {
    state.forceVerify = true;
    return { skip: 0 };
  }

  if (arg === "--help" || arg === "-h") {
    return { help: true };
  }

  return null;
}

function processRunFlag(args: string[], i: number, arg: string, state: RunArgState): FlagResult | null {
  const boolResult = processBooleanFlag(arg, state);

  if (boolResult) return boolResult;

  for (const def of buildValueFlagDefs(state)) {
    const result = handleValueFlag(args, i, arg, def.flags, def.equalPrefix, def.setter);

    if (result) return result;
  }

  return null;
}

function parseRunArgs(args: string[], rawPrompt: boolean): CliCommand {
  const { solardi: solardiArgs, passthrough } = splitAtDoubleDash(args);
  const state = createDefaultRunArgState();

  for (let i = 0; i < solardiArgs.length; i++) {
    const arg = solardiArgs[i];
    const result = processRunFlag(solardiArgs, i, arg, state);

    if (result && "help" in result) {
      return { kind: "help" };
    }

    if (result) {
      i += result.skip;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      return { kind: "help" };
    } else {
      state.positional.push(arg);
    }
  }

  const prompt = state.positional.join(" ");

  if (!prompt) {
    console.error("Error: prompt is required");
    return { kind: "help" };
  }

  return {
    kind: "run", agentName: state.agentName, prompt, rawPrompt, verbose: state.verbose,
    spec: state.spec, extraPrompt: state.extraPrompt, passthrough, metricsBaseUrl: state.metricsBaseUrl,
    forceVerify: state.forceVerify,
  };
}

function parseUiArgs(args: string[]): CliCommand {
  let host = "0.0.0.0";
  let port = 19191;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--host") {
      host = requireNextArg(args, i, arg);
      i++;
    } else if (arg.startsWith("--host=")) {
      host = arg.split("=").slice(1).join("=");
    } else if (arg === "--port") {
      port = parseInt(requireNextArg(args, i, arg), 10);
      i++;
    } else if (arg.startsWith("--port=")) {
      port = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }
  }

  return { kind: "ui", host, port };
}

function splitAtDoubleDash(args: string[]): { solardi: string[]; passthrough: string[] } {
  const ddIndex = args.indexOf("--");

  if (ddIndex === -1) {
    return { solardi: args, passthrough: [] };
  }

  return {
    solardi: args.slice(0, ddIndex),
    passthrough: args.slice(ddIndex + 1),
  };
}

function requireNextArg(args: string[], index: number, flag: string): string {
  if (index + 1 >= args.length) {
    console.error(`Error: ${flag} requires a value`);
    process.exit(1);
  }

  return args[index + 1];
}

export function printUsage(): void {
  const agents = listAgentNames().join(", ");
  const commands = listBuiltInCommandNames();
  const commandList = commands.map((c) => `  ${c}`).join("\n");

  console.log(`
Usage: solardi <command> [options]

Commands:
  prompt [options] <prompt>   Run an agent with a raw prompt
  config                      Show current configuration
  version                     Show version
  ui                          Start the metrics dashboard
  help                        Show this help message

Available commands:
${commandList}

Options:
  --agent, -a <name>    Agent to use (default: from config)
                        Available: ${agents}
  --verbose, -v         Show additional metadata for each message
  --spec <path>         Path to a spec file for context (e.g., hunt-bugs)
  --prompt, -p <text>   Additional guidance for the agent
  --report-metrics-base-url <host:port>
                        Metrics server address (default: localhost:19191)
                        Metrics are reported by default; a warning is shown
                        if the server is unreachable
  --force-verify        Re-verify all specs against code (ignores hashes)
  --help, -h            Show this help message
  --                    Pass remaining flags to the underlying agent

UI Options:
  --host <host>         Dashboard bind address (default: 0.0.0.0)
  --port <port>         Dashboard port (default: 19191)

Examples:
  solardi quality
  solardi build
  solardi hunt-bugs
  solardi hunt-bugs --spec specs/api.md --prompt 'focus on auth module'
  solardi generate-spec 'Add new endpoint /api/users to create users'
  solardi build --force-verify
  solardi prompt 'refactor the auth module'
  solardi quality --agent=claude
  solardi quality -v
  solardi quality --report-metrics-base-url=myhost:8080
  solardi quality -- --max-turns 5
  solardi ui
  solardi ui --port 8080
  solardi config
`);
}
