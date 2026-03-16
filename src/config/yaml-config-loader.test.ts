import * as path from "path";
import { stringify } from "yaml";
import { YamlConfigLoader } from "./yaml-config-loader";
import { SolardiConfig } from "./config";
import { createMockFileSystem } from "../test/mock-filesystem";

describe("YamlConfigLoader", () => {
  const configDir = path.join("/home", "user", ".solardi");
  const configPath = path.join(configDir, "config.yaml");

  it("creates default config file when none exists", async () => {
    const fs = createMockFileSystem();
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.default_agent).toBe("claude");
    expect(config.loop.max_turn_time_minutes).toBe(15);
    expect(config.agents.claude.type).toBe("claude");
    expect(fs.mkdirRecursive).toHaveBeenCalledWith(configDir);
    expect(fs.writeFile).toHaveBeenCalledWith(configPath, expect.any(String));
  });

  it("reads existing config file", async () => {
    const existing: SolardiConfig = {
      default_agent: "codex",
      loop: { max_turn_time_minutes: 10 },
      agents: {
        codex: { type: "codex" },
      },
    };
    const fs = createMockFileSystem({ [configPath]: stringify(existing) });
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.default_agent).toBe("codex");
    expect(config.loop.max_turn_time_minutes).toBe(10);
    expect(config.agents.codex.type).toBe("codex");
  });

  it("merges partial config with defaults", async () => {
    const partial = { default_agent: "codex" };
    const fs = createMockFileSystem({ [configPath]: stringify(partial) });
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.default_agent).toBe("codex");
    expect(config.loop.max_turn_time_minutes).toBe(15);
    expect(config.agents.claude.type).toBe("claude");
  });

  it("logs warning when config validation fails", async () => {
    const invalidYaml = "default_agent: 123\nloop:\n  max_turn_time_minutes: -5\n";
    const fs = createMockFileSystem({ [configPath]: invalidYaml });
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const loader = new YamlConfigLoader({ filesystem: fs, configDir, logger: mockLogger });

    const config = await loader.load();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("config validation failed"),
    );
    expect(config).toBeDefined();
  });

  it("applies project config when projectConfigLoader returns config", async () => {
    const fs = createMockFileSystem({ [configPath]: stringify({ default_agent: "claude" }) });
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const projectConfigLoader = {
      load: jest.fn().mockResolvedValue({
        loop: { max_turn_time_minutes: 5 },
      }),
    };
    const loader = new YamlConfigLoader({
      filesystem: fs,
      configDir,
      logger: mockLogger,
      projectConfigLoader,
    });

    const config = await loader.load();

    expect(config.loop.max_turn_time_minutes).toBe(5);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Loaded project config"),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Project overrides max_turn_time_minutes"),
    );
  });

  it("returns global config when projectConfigLoader returns null", async () => {
    const fs = createMockFileSystem({ [configPath]: stringify({ default_agent: "claude" }) });
    const projectConfigLoader = {
      load: jest.fn().mockResolvedValue(null),
    };
    const loader = new YamlConfigLoader({
      filesystem: fs,
      configDir,
      projectConfigLoader,
    });

    const config = await loader.load();

    expect(config.default_agent).toBe("claude");
    expect(projectConfigLoader.load).toHaveBeenCalled();
  });

  it("returns global config when no projectConfigLoader is provided", async () => {
    const fs = createMockFileSystem({ [configPath]: stringify({ default_agent: "codex" }) });
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.default_agent).toBe("codex");
  });

  it("applies project config without max_turn_time_minutes override", async () => {
    const fs = createMockFileSystem({ [configPath]: stringify({ default_agent: "claude" }) });
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const projectConfigLoader = {
      load: jest.fn().mockResolvedValue({
        default_agent: "codex",
      }),
    };
    const loader = new YamlConfigLoader({
      filesystem: fs,
      configDir,
      logger: mockLogger,
      projectConfigLoader,
    });

    const config = await loader.load();

    expect(config.default_agent).toBe("codex");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Loaded project config"),
    );
    // Should NOT log the max_turn_time_minutes override message
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining("Project overrides max_turn_time_minutes"),
    );
  });

  it("preserves append_system_prompt from config", async () => {
    const existing: SolardiConfig = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: {
        claude: {
          type: "claude",
          append_system_prompt: "Be concise and direct",
        },
      },
    };
    const fs = createMockFileSystem({ [configPath]: stringify(existing) });
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.agents.claude.append_system_prompt).toBe("Be concise and direct");
  });
});
