import { isKnownTool, formatToolInput } from "./tool-formatter";

describe("isKnownTool", () => {
  it("returns true for Agent", () => {
    expect(isKnownTool("Agent")).toBe(true);
  });

  it("returns true for Bash", () => {
    expect(isKnownTool("Bash")).toBe(true);
  });

  it("returns true for Read", () => {
    expect(isKnownTool("Read")).toBe(true);
  });

  it("returns true for Glob", () => {
    expect(isKnownTool("Glob")).toBe(true);
  });

  it("returns false for unknown tools", () => {
    expect(isKnownTool("Write")).toBe(false);
    expect(isKnownTool("Edit")).toBe(false);
  });
});

describe("formatToolInput", () => {
  describe("Agent tool", () => {
    it("formats agent with type and description", () => {
      const json = JSON.stringify({
        subagent_type: "Explore",
        description: "Read all source files",
        prompt: "Read ALL files...",
      });

      const result = formatToolInput("Agent", json);

      expect(result).toEqual({
        label: "Agent (Explore)",
        details: ["Read all source files"],
      });
    });

    it("defaults to unknown when subagent_type is missing", () => {
      const json = JSON.stringify({ prompt: "do stuff" });
      const result = formatToolInput("Agent", json);

      expect(result?.label).toBe("Agent (unknown)");
    });
  });

  describe("Bash tool", () => {
    it("formats bash with description and command", () => {
      const json = JSON.stringify({
        command: "npm test --prefix D:/project",
        description: "Run project tests with npm",
        timeout: 60000,
      });

      const result = formatToolInput("Bash", json);

      expect(result).toEqual({
        label: "Bash",
        details: [
          "Run project tests with npm",
          "$ npm test --prefix D:/project",
        ],
      });
    });

    it("shows only command when description is missing", () => {
      const json = JSON.stringify({ command: "ls -la" });
      const result = formatToolInput("Bash", json);

      expect(result).toEqual({
        label: "Bash",
        details: ["$ ls -la"],
      });
    });
  });

  describe("Read tool", () => {
    it("formats read with file path", () => {
      const json = JSON.stringify({
        file_path: "D:\\Development\\Typescript\\solito\\tsconfig.json",
      });

      const result = formatToolInput("Read", json);

      expect(result).toEqual({
        label: "Read",
        details: ["D:\\Development\\Typescript\\solito\\tsconfig.json"],
      });
    });

    it("returns empty details when file_path is missing", () => {
      const result = formatToolInput("Read", "{}");

      expect(result).toEqual({ label: "Read", details: [] });
    });
  });

  describe("Glob tool", () => {
    it("formats glob with pattern and path", () => {
      const json = JSON.stringify({
        pattern: "src/**/*.ts",
        path: "D:\\Development\\Typescript\\solito",
      });

      const result = formatToolInput("Glob", json);

      expect(result).toEqual({
        label: "Glob",
        details: [
          "src/**/*.ts",
          "in D:\\Development\\Typescript\\solito",
        ],
      });
    });

    it("shows only pattern when path is missing", () => {
      const json = JSON.stringify({ pattern: "**/*.test.ts" });
      const result = formatToolInput("Glob", json);

      expect(result).toEqual({
        label: "Glob",
        details: ["**/*.test.ts"],
      });
    });
  });

  it("returns null for unknown tools", () => {
    const result = formatToolInput("Edit", '{"file_path": "/tmp/foo"}');
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const result = formatToolInput("Bash", "not json");
    expect(result).toBeNull();
  });

  describe("non-object JSON values", () => {
    it("returns null for string JSON", () => {
      expect(formatToolInput("Bash", '"hello"')).toBeNull();
    });

    it("returns null for number JSON", () => {
      expect(formatToolInput("Bash", "42")).toBeNull();
    });

    it("returns null for null JSON", () => {
      expect(formatToolInput("Bash", "null")).toBeNull();
    });

    it("returns null for array JSON", () => {
      expect(formatToolInput("Bash", "[1, 2, 3]")).toBeNull();
    });

    it("returns null for boolean JSON", () => {
      expect(formatToolInput("Bash", "true")).toBeNull();
    });
  });
});
