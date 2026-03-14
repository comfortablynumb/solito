import { parseArgs } from "./args";

describe("parseArgs", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("run command", () => {
    it("parses 'run' subcommand with prompt", () => {
      const result = parseArgs(["node", "solito", "run", "fix the bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("parses 'run' with --agent flag", () => {
      const result = parseArgs(["node", "solito", "run", "--agent", "codex", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "do stuff",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("parses 'run' with --agent=value syntax", () => {
      const result = parseArgs(["node", "solito", "run", "--agent=codex", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "do stuff",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("parses 'run' with -a shorthand", () => {
      const result = parseArgs(["node", "solito", "run", "-a", "codex", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: "codex", prompt: "do stuff",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("joins multiple positional args as prompt", () => {
      const result = parseArgs(["node", "solito", "run", "fix", "the", "bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });
  });

  describe("verbose flag", () => {
    it("parses --verbose", () => {
      const result = parseArgs(["node", "solito", "run", "--verbose", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "do stuff",
        rawPrompt: false, verbose: true, passthrough: [],
      });
    });

    it("parses -v shorthand", () => {
      const result = parseArgs(["node", "solito", "run", "-v", "do stuff"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "do stuff",
        rawPrompt: false, verbose: true, passthrough: [],
      });
    });
  });

  describe("passthrough args (--)", () => {
    it("captures args after -- as passthrough", () => {
      const result = parseArgs([
        "node", "solito", "run", "do stuff", "--", "--max-turns", "5",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "do stuff",
        rawPrompt: false, verbose: false, passthrough: ["--max-turns", "5"],
      });
    });

    it("works with other flags before --", () => {
      const result = parseArgs([
        "node", "solito", "run", "-a", "claude", "do stuff", "--", "--verbose",
      ]);
      expect(result).toEqual({
        kind: "run", agentName: "claude", prompt: "do stuff",
        rawPrompt: false, verbose: false, passthrough: ["--verbose"],
      });
    });

    it("returns empty passthrough when no -- present", () => {
      const result = parseArgs(["node", "solito", "run", "do stuff"]);

      if (result.kind === "run") {
        expect(result.passthrough).toEqual([]);
      }
    });
  });

  describe("implicit run (no subcommand)", () => {
    it("treats unknown first arg as implicit run prompt", () => {
      const result = parseArgs(["node", "solito", "fix the bug"]);
      expect(result).toEqual({
        kind: "run", agentName: undefined, prompt: "fix the bug",
        rawPrompt: false, verbose: false, passthrough: [],
      });
    });

    it("supports --agent with implicit run", () => {
      const result = parseArgs(["node", "solito", "--agent=claude", "fix it"]);
      expect(result).toEqual({
        kind: "run", agentName: "claude", prompt: "fix it",
        rawPrompt: false, verbose: false, passthrough: [],
      });
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

    it("returns help when run has no prompt", () => {
      expect(parseArgs(["node", "solito", "run"])).toEqual({ kind: "help" });
    });
  });
});
