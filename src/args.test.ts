import { parseArgs, listBuiltInSubcommands } from "./args";

const DEFAULT_METRICS = { reportMetrics: false, apiHost: "localhost", apiPort: 19191 };

describe("parseArgs", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("command name (first arg)", () => {
    it("parses command name as prompt", () => {
      const result = parseArgs(["node", "solito", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses command name with --agent flag", () => {
      const result = parseArgs(["node", "solito", "--agent", "codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses command name with --agent=value syntax", () => {
      const result = parseArgs(["node", "solito", "--agent=codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses command name with -a shorthand", () => {
      const result = parseArgs(["node", "solito", "-a", "codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });
  });

  describe("verbose flag", () => {
    it("parses --verbose", () => {
      const result = parseArgs(["node", "solito", "--verbose", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: true, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses -v shorthand", () => {
      const result = parseArgs(["node", "solito", "-v", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: true, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });
  });

  describe("passthrough args (--)", () => {
    it("captures args after -- as passthrough", () => {
      const result = parseArgs([
        "node", "solito", "quality", "--", "--max-turns", "5",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: ["--max-turns", "5"],
        ...DEFAULT_METRICS,
      });
    });

    it("works with other flags before --", () => {
      const result = parseArgs([
        "node", "solito", "-a", "claude", "quality", "--", "--verbose",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: "claude", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: ["--verbose"],
        ...DEFAULT_METRICS,
      });
    });

    it("returns empty passthrough when no -- present", () => {
      const result = parseArgs(["node", "solito", "quality"]);

      if (result.kind === "run") {
        expect(result.passthrough).toEqual([]);
      }
    });
  });

  describe("prompt command", () => {
    it("parses 'prompt' subcommand with raw prompt", () => {
      const result = parseArgs(["node", "solito", "prompt", "fix the bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: true, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("never resolves as a named command", () => {
      const result = parseArgs(["node", "solito", "prompt", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: true, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("supports --agent flag", () => {
      const result = parseArgs(["node", "solito", "prompt", "-a", "codex", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "do stuff",
        rawPrompt: true, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("supports passthrough args", () => {
      const result = parseArgs([
        "node", "solito", "prompt", "do stuff", "--", "--max-turns", "3",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "do stuff",
        rawPrompt: true, verbose: false, passthrough: ["--max-turns", "3"],
        ...DEFAULT_METRICS,
      });
    });

    it("joins multiple positional args as prompt", () => {
      const result = parseArgs(["node", "solito", "prompt", "fix", "the", "bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: true, verbose: false, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("returns help when prompt has no argument", () => {
      expect(parseArgs(["node", "solito", "prompt"])).toEqual({ kind: "help" });
    });
  });

  describe("--spec flag", () => {
    it("parses --spec with value", () => {
      const result = parseArgs(["node", "solito", "hunt-bugs", "--spec", "specs/api.md"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: "specs/api.md",
        extraPrompt: undefined, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses --spec=value syntax", () => {
      const result = parseArgs(["node", "solito", "hunt-bugs", "--spec=specs/api.md"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: "specs/api.md",
        extraPrompt: undefined, passthrough: [],
        ...DEFAULT_METRICS,
      });
    });
  });

  describe("--prompt flag", () => {
    it("parses --prompt with value", () => {
      const result = parseArgs(["node", "solito", "hunt-bugs", "--prompt", "focus on auth"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: undefined,
        extraPrompt: "focus on auth", passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses -p shorthand", () => {
      const result = parseArgs(["node", "solito", "hunt-bugs", "-p", "focus on auth"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: undefined,
        extraPrompt: "focus on auth", passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("parses --prompt=value syntax", () => {
      const result = parseArgs(["node", "solito", "hunt-bugs", "--prompt=focus on auth"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: undefined,
        extraPrompt: "focus on auth", passthrough: [],
        ...DEFAULT_METRICS,
      });
    });

    it("combines --spec and --prompt", () => {
      const result = parseArgs([
        "node", "solito", "hunt-bugs", "--spec", "specs/api.md", "--prompt", "check auth",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "hunt-bugs",
        rawPrompt: false, verbose: false, spec: "specs/api.md",
        extraPrompt: "check auth", passthrough: [],
        ...DEFAULT_METRICS,
      });
    });
  });

  describe("--report-metrics flag", () => {
    it("parses --report-metrics", () => {
      const result = parseArgs(["node", "solito", "quality", "--report-metrics"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
        reportMetrics: true, apiHost: "localhost", apiPort: 19191,
      });
    });

    it("parses --api-host and --api-port", () => {
      const result = parseArgs([
        "node", "solito", "quality", "--report-metrics",
        "--api-host", "192.168.1.1", "--api-port", "8080",
      ]);

      if (result.kind === "run") {
        expect(result.reportMetrics).toBe(true);
        expect(result.apiHost).toBe("192.168.1.1");
        expect(result.apiPort).toBe(8080);
      }
    });
  });

  describe("ui command", () => {
    it("parses 'ui' subcommand with defaults", () => {
      const result = parseArgs(["node", "solito", "ui"]);
      expect(result).toEqual({ kind: "ui", host: "0.0.0.0", port: 19191 });
    });

    it("parses --host and --port flags", () => {
      const result = parseArgs(["node", "solito", "ui", "--host", "127.0.0.1", "--port", "8080"]);
      expect(result).toEqual({ kind: "ui", host: "127.0.0.1", port: 8080 });
    });

    it("parses --host=value and --port=value syntax", () => {
      const result = parseArgs(["node", "solito", "ui", "--host=localhost", "--port=3000"]);
      expect(result).toEqual({ kind: "ui", host: "localhost", port: 3000 });
    });

    it("returns help for ui --help", () => {
      expect(parseArgs(["node", "solito", "ui", "--help"])).toEqual({ kind: "help" });
    });
  });

  describe("config command", () => {
    it("parses 'config' subcommand", () => {
      expect(parseArgs(["node", "solito", "config"])).toEqual({ kind: "config" });
    });
  });

  describe("help", () => {
    it("returns help when no args", () => {
      expect(parseArgs(["node", "solito"])).toEqual({ kind: "help" });
    });

    it("returns help for --help flag", () => {
      expect(parseArgs(["node", "solito", "--help"])).toEqual({ kind: "help" });
    });

    it("returns help for -h flag", () => {
      expect(parseArgs(["node", "solito", "-h"])).toEqual({ kind: "help" });
    });

    it("returns help for 'help' subcommand", () => {
      expect(parseArgs(["node", "solito", "help"])).toEqual({ kind: "help" });
    });

    it("returns help when no command name provided with flags only", () => {
      expect(parseArgs(["node", "solito", "-v"])).toEqual({ kind: "help" });
    });

    it("returns help for unknown flags in run mode", () => {
      expect(parseArgs(["node", "solito", "quality", "--unknown-flag"])).toEqual({ kind: "help" });
    });

    it("returns help for --help within prompt subcommand", () => {
      expect(parseArgs(["node", "solito", "prompt", "--help", "some text"])).toEqual({ kind: "help" });
    });

    it("returns help for -h within prompt subcommand", () => {
      expect(parseArgs(["node", "solito", "prompt", "-h"])).toEqual({ kind: "help" });
    });
  });
});

describe("listBuiltInSubcommands", () => {
  it("returns the list of built-in subcommands", () => {
    const result = listBuiltInSubcommands();
    expect(result).toContain("prompt");
    expect(result).toContain("config");
    expect(result).toContain("help");
    expect(result).toContain("ui");
  });
});
