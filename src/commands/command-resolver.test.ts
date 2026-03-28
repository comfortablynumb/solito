import { DefaultCommandResolver } from "./command-resolver";
import { createMockFileSystem } from "../test/mock-filesystem";
import { TemplateRenderer } from "../interpolation/template-renderer";
import { CommandConfig } from "../config/config";

function createMockRenderer(rootDir: string = "/solardi"): TemplateRenderer {
  return {
    render: jest.fn((template: string, context: Record<string, unknown>) => {
      return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
        const keys = key.trim().split(".");
        let current: unknown = context;

        for (const k of keys) {
          if (typeof current !== "object" || current === null) return match;
          current = (current as Record<string, unknown>)[k];
        }

        return typeof current === "object" ? match : String(current ?? match);
      });
    }),
  };
}

describe("DefaultCommandResolver", () => {
  it("returns raw prompt when no matching command exists", async () => {
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands: {},
    });

    const result = await resolver.resolve("fix the bug");

    expect(result.prompt).toBe("fix the bug");
    expect(result.isCommand).toBe(false);
  });

  it("resolves a named command to its prompt file content", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: { prompt: "{{ solardi_root_dir }}/prompts/quality.md" },
    };
    const filesystem = createMockFileSystem({
      "/solardi/prompts/quality.md": "You are a quality guardian.",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("You are a quality guardian.");
    expect(result.isCommand).toBe(true);
    expect(result.commandName).toBe("quality");
  });

  it("returns raw content without rendering variables (rendering happens in cli.ts)", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: {
        prompt: "{{ solardi_root_dir }}/prompts/q.md",
        variables: { threshold: 0.5 },
      },
    };
    const filesystem = createMockFileSystem({
      "/solardi/prompts/q.md": "Min threshold: ${var:threshold}%",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("Min threshold: ${var:threshold}%");
  });

  it("resolves first word as command name with inline prompt", async () => {
    const commands: Record<string, CommandConfig> = {
      "generate-spec": { prompt: "{{ solardi_root_dir }}/prompts/gen.md" },
    };
    const filesystem = createMockFileSystem({
      "/solardi/prompts/gen.md": "Generate a spec.",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    const result = await resolver.resolve("generate-spec Add a users endpoint");

    expect(result.prompt).toBe("Generate a spec.");
    expect(result.isCommand).toBe(true);
    expect(result.commandName).toBe("generate-spec");
    expect(result.inlinePrompt).toBe("Add a users endpoint");
  });

  it("returns not-a-command when first word does not match any command", async () => {
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands: { quality: { prompt: "{{ solardi_root_dir }}/prompts/q.md" } },
    });

    const result = await resolver.resolve("unknown-cmd do something");

    expect(result.isCommand).toBe(false);
    expect(result.inlinePrompt).toBeUndefined();
  });

  it("defaults to empty commands when commands is undefined", async () => {
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
    });

    const result = await resolver.resolve("anything");

    expect(result.isCommand).toBe(false);
    expect(result.prompt).toBe("anything");
  });

  it("throws when prompt file does not exist", async () => {
    const commands: Record<string, CommandConfig> = {
      missing: { prompt: "{{ solardi_root_dir }}/prompts/missing.md" },
    };
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    await expect(resolver.resolve("missing")).rejects.toThrow("ENOENT");
  });

  it("normalizes legacy ${var:X} syntax in prompt path from config", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: { prompt: "${var:solardi_root_dir}/prompts/quality.md" },
    };
    const filesystem = createMockFileSystem({
      "/solardi/prompts/quality.md": "Quality prompt content.",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("Quality prompt content.");
    expect(result.isCommand).toBe(true);
  });

  it("derives prompt path from command name when prompt is not specified", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: {},
    };
    const filesystem = createMockFileSystem({
      "/solardi/prompts/quality.md": "Quality prompt content.",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      renderer: createMockRenderer(),
      solardiRootDir: "/solardi",
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("Quality prompt content.");
    expect(result.isCommand).toBe(true);
  });
});
