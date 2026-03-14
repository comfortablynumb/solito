import { parseArgs } from "./args";

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
      });
    });

    it("parses command name with --agent flag", () => {
      const result = parseArgs(["node", "solito", "--agent", "codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("parses command name with --agent=value syntax", () => {
      const result = parseArgs(["node", "solito", "--agent=codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("parses command name with -a shorthand", () => {
      const result = parseArgs(["node", "solito", "-a", "codex", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });
  });

  describe("verbose flag", () => {
    it("parses --verbose", () => {
      const result = parseArgs(["node", "solito", "--verbose", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: true, passthrough: [],
      });
    });

    it("parses -v shorthand", () => {
      const result = parseArgs(["node", "solito", "-v", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: false, verbose: true, passthrough: [],
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
      });
    });

    it("works with other flags before --", () => {
      const result = parseArgs([
        "node", "solito", "-a", "claude", "quality", "--", "--verbose",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: "claude", prompt: "quality",
        rawPrompt: false, verbose: false, passthrough: ["--verbose"],
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
      });
    });

    it("never resolves as a named command", () => {
      const result = parseArgs(["node", "solito", "prompt", "quality"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "quality",
        rawPrompt: true, verbose: false, passthrough: [],
      });
    });

    it("supports --agent flag", () => {
      const result = parseArgs(["node", "solito", "prompt", "-a", "codex", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "do stuff",
        rawPrompt: true, verbose: false, passthrough: [],
      });
    });

    it("supports passthrough args", () => {
      const result = parseArgs([
        "node", "solito", "prompt", "do stuff", "--", "--max-turns", "3",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "do stuff",
        rawPrompt: true, verbose: false, passthrough: ["--max-turns", "3"],
      });
    });

    it("joins multiple positional args as prompt", () => {
      const result = parseArgs(["node", "solito", "prompt", "fix", "the", "bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: true, verbose: false, passthrough: [],
      });
    });

    it("returns help when prompt has no argument", () => {
      expect(parseArgs(["node", "solito", "prompt"])).toEqual({ kind: "help" });
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
  });
});
