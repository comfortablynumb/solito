import { DefaultCommandResolver } from "./command-resolver";
import { createMockFileSystem } from "../test/mock-filesystem";
import { VariableResolver } from "../interpolation/variable-resolver";
import { CommandConfig, CommandVariables } from "../config/config";

function createMockResolver(rootDir: string = "/solito"): VariableResolver {
  return {
    resolve: jest.fn((template: string, variables?: CommandVariables) => {
      let result = template;
      result = result.replace(/\$\{var:solito_root_dir\}/g, rootDir);

      if (variables) {
        result = result.replace(/\$\{var:([^}]+)\}/g, (match, key) => {
          const keys = key.split(".");
          let current: unknown = variables;

          for (const k of keys) {
            if (typeof current !== "object" || current === null) return match;
            current = (current as Record<string, unknown>)[k];
          }

          return typeof current === "object" ? match : String(current);
        });
      }

      return result;
    }),
  };
}

describe("DefaultCommandResolver", () => {
  it("returns raw prompt when no matching command exists", async () => {
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      variableResolver: createMockResolver(),
      commands: {},
    });

    const result = await resolver.resolve("fix the bug");

    expect(result.prompt).toBe("fix the bug");
    expect(result.isCommand).toBe(false);
  });

  it("resolves a named command to its prompt file content", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: { prompt: "${var:solito_root_dir}/prompts/quality.md" },
    };
    const filesystem = createMockFileSystem({
      "/solito/prompts/quality.md": "You are a quality guardian.",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      variableResolver: createMockResolver(),
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("You are a quality guardian.");
    expect(result.isCommand).toBe(true);
    expect(result.commandName).toBe("quality");
  });

  it("interpolates variables in prompt file content", async () => {
    const commands: Record<string, CommandConfig> = {
      quality: {
        prompt: "${var:solito_root_dir}/prompts/q.md",
        variables: { threshold: 0.5 },
      },
    };
    const filesystem = createMockFileSystem({
      "/solito/prompts/q.md": "Min threshold: ${var:threshold}%",
    });
    const resolver = new DefaultCommandResolver({
      filesystem,
      variableResolver: createMockResolver(),
      commands,
    });

    const result = await resolver.resolve("quality");

    expect(result.prompt).toBe("Min threshold: 0.5%");
  });

  it("throws when prompt file does not exist", async () => {
    const commands: Record<string, CommandConfig> = {
      missing: { prompt: "${var:solito_root_dir}/prompts/missing.md" },
    };
    const resolver = new DefaultCommandResolver({
      filesystem: createMockFileSystem(),
      variableResolver: createMockResolver(),
      commands,
    });

    await expect(resolver.resolve("missing")).rejects.toThrow("ENOENT");
  });
});
