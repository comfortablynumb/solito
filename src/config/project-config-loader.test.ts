import { DefaultProjectConfigLoader } from "./project-config-loader";
import { createMockFileSystem } from "../test/mock-filesystem";

describe("DefaultProjectConfigLoader", () => {
  it("returns null when project config does not exist", async () => {
    const filesystem = createMockFileSystem({});
    const loader = new DefaultProjectConfigLoader({
      filesystem,
      cwd: "/project",
    });

    const result = await loader.load();

    expect(result).toBeNull();
  });

  it("loads and parses project config when it exists", async () => {
    const yaml = "default_agent: codex\n";
    const filesystem = createMockFileSystem({
      "/project/.solito/config.yaml": yaml,
    });
    const loader = new DefaultProjectConfigLoader({
      filesystem,
      cwd: "/project",
    });

    const result = await loader.load();

    expect(result).toEqual({ default_agent: "codex" });
  });

  it("loads project config with commands", async () => {
    const yaml = [
      "commands:",
      "  lint:",
      '    prompt: "./prompts/lint.md"',
    ].join("\n");
    const filesystem = createMockFileSystem({
      "/project/.solito/config.yaml": yaml,
    });
    const loader = new DefaultProjectConfigLoader({
      filesystem,
      cwd: "/project",
    });

    const result = await loader.load();

    expect(result?.commands?.lint?.prompt).toBe("./prompts/lint.md");
  });
});
