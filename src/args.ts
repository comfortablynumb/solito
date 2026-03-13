import { listAgentNames } from "./agents/registry";
import { listBuiltInCommandNames } from "./config/default-config";

export interface RunCommand {
  kind: "run";
  agentName?: string;
  prompt: string;
  verbose: boolean;
  passthrough: string[];
}

export type CliCommand =
  | RunCommand
  | { kind: "config" }
  | { kind: "help" };

export function parseArgs(argv: string[]): CliCommand {
  const args = argv.slice(2);

  if (args.length === 0) {
    return { kind: "help" };
  }

  const subcommand = args[0];

  if (subcommand === "config") {
    return { kind: "config" };
  }

  if (subcommand === "--help" || subcommand === "-h") {
    return { kind: "help" };
  }

  if (subcommand === "run") {
    return parseRunArgs(args.slice(1));
  }

  return parseRunArgs(args);
}

function parseRunArgs(args: string[]): CliCommand {
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

  return { kind: "run", agentName, prompt, verbose, passthrough };
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
  run [options] <command|prompt>   Run an agent with a named command or raw prompt
  config                           Show current configuration

Available run commands:
${commandList}

Options (for run):
  --agent, -a <name>  Agent to use (default: from config)
                      Available: ${agents}
  --verbose, -v       Show additional metadata for each message
  --help, -h          Show this help message
  --                  Pass remaining flags to the underlying agent

Examples:
  solito run quality
  solito run build
  solito run 'refactor the auth module'
  solito run --agent=claude 'fix the login bug'
  solito run -v 'fix the bug'
  solito run 'fix it' -- --max-turns 5
  solito config
`);
}
