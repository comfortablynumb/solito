import { listAgentNames } from "./agents/registry";
import { listBuiltInCommandNames } from "./config/default-config";

export interface RunCommand {
  kind: "run";
  agentName?: string;
  prompt: string;
  rawPrompt: boolean;
  verbose: boolean;
  passthrough: string[];
}

export type CliCommand =
  | RunCommand
  | { kind: "config" }
  | { kind: "help" };

const BUILT_IN_SUBCOMMANDS = ["prompt", "config", "help"];

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

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    return { kind: "help" };
  }

  if (subcommand === "prompt") {
    return parseRunArgs(args.slice(1), true);
  }

  // First arg is a command name — pass it as the prompt for resolution
  return parseRunArgs(args, false);
}

function parseRunArgs(args: string[], rawPrompt: boolean): CliCommand {
  const { solito: solitoArgs, passthrough } = splitAtDoubleDash(args);
  let agentName: string | undefined;
  let verbose = false;
  const positional: string[] = [];

  for (let i = 0; i < solitoArgs.length; i++) {
    const arg = solitoArgs[i];

    if (arg === "--agent" || arg === "-a") {
      agentName = requireNextArg(solitoArgs, i, arg);
      i++;
    } else if (arg.startsWith("--agent=")) {
      agentName = arg.split("=")[1];
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      return { kind: "help" };
    } else {
      positional.push(arg);
    }
  }

  const prompt = positional.join(" ");

  if (!prompt) {
    console.error("Error: prompt is required");
    return { kind: "help" };
  }

  return { kind: "run", agentName, prompt, rawPrompt, verbose, passthrough };
}

function splitAtDoubleDash(args: string[]): { solito: string[]; passthrough: string[] } {
  const ddIndex = args.indexOf("--");

  if (ddIndex === -1) {
    return { solito: args, passthrough: [] };
  }

  return {
    solito: args.slice(0, ddIndex),
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
Usage: solito <command> [options]

Commands:
  prompt [options] <prompt>   Run an agent with a raw prompt
  config                      Show current configuration
  help                        Show this help message

Available commands:
${commandList}

Options:
  --agent, -a <name>  Agent to use (default: from config)
                      Available: ${agents}
  --verbose, -v       Show additional metadata for each message
  --help, -h          Show this help message
  --                  Pass remaining flags to the underlying agent

Examples:
  solito quality
  solito build
  solito prompt 'refactor the auth module'
  solito quality --agent=claude
  solito quality -v
  solito quality -- --max-turns 5
  solito config
`);
}
