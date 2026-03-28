export interface ToolDisplay {
  label: string;
  details: string[];
}

interface AgentInput {
  subagent_type?: string;
  description?: string;
}

interface BashInput {
  command?: string;
  description?: string;
}

interface EditInput {
  file_path?: string;
}

interface WriteInput {
  file_path?: string;
}

interface ReadInput {
  file_path?: string;
}

interface GlobInput {
  pattern?: string;
  path?: string;
}

const KNOWN_TOOLS = new Set(["Agent", "Bash", "Edit", "Write", "Read", "Glob"]);

export function isKnownTool(name: string): boolean {
  return KNOWN_TOOLS.has(name);
}

export function formatToolInput(toolName: string, json: string): ToolDisplay | null {
  try {
    const input = JSON.parse(json);

    if (!isRecord(input)) {
      return null;
    }

    switch (toolName) {
      case "Agent":
        return formatAgent(input as AgentInput);
      case "Bash":
        return formatBash(input as BashInput);
      case "Edit":
        return formatEdit(input as EditInput);
      case "Write":
        return formatWrite(input as WriteInput);
      case "Read":
        return formatRead(input as ReadInput);
      case "Glob":
        return formatGlob(input as GlobInput);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function formatAgent(input: AgentInput): ToolDisplay {
  const agentType = input.subagent_type ?? "unknown";
  const label = `Agent (${agentType})`;
  const details: string[] = [];

  if (input.description) {
    details.push(input.description);
  }

  return { label, details };
}

function formatBash(input: BashInput): ToolDisplay {
  const details: string[] = [];

  if (input.description) {
    details.push(input.description);
  }

  if (input.command) {
    details.push(`$ ${input.command}`);
  }

  return { label: "Bash", details };
}

function formatEdit(input: EditInput): ToolDisplay {
  const details: string[] = [];

  if (input.file_path) {
    details.push(input.file_path);
  }

  return { label: "Edit", details };
}

function formatWrite(input: WriteInput): ToolDisplay {
  const details: string[] = [];

  if (input.file_path) {
    details.push(input.file_path);
  }

  return { label: "Write", details };
}

function formatRead(input: ReadInput): ToolDisplay {
  const details: string[] = [];

  if (input.file_path) {
    details.push(input.file_path);
  }

  return { label: "Read", details };
}

function formatGlob(input: GlobInput): ToolDisplay {
  const details: string[] = [];

  if (input.pattern) {
    details.push(input.pattern);
  }

  if (input.path) {
    details.push(`in ${input.path}`);
  }

  return { label: "Glob", details };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
