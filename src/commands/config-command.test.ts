import { executeConfigCommand } from "./config-command";
import { ConfigLoader, SolardiConfig } from "../config/config";
import { ProjectConfigLoader } from "../config/project-config-loader";

function createMockConfigLoader(config: SolardiConfig): ConfigLoader {
  return {
    load: jest.fn().mockResolvedValue(config),
  };
}

function createMockProjectConfigLoader(config: Partial<SolardiConfig> | null): ProjectConfigLoader {
  return {
    load: jest.fn().mockResolvedValue(config),
  };
}

describe("executeConfigCommand", () => {
  it("outputs config as YAML and returns 0", async () => {
    const config: SolardiConfig = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };
    const configLoader = createMockConfigLoader(config);
    const output = jest.fn();

    const code = await executeConfigCommand({ configLoader, output });

    expect(code).toBe(0);

    const allOutput = output.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allOutput).toContain("default_agent: claude");
    expect(allOutput).toContain("max_turn_time_minutes: 10");
  });

  it("shows project overrides when present", async () => {
    const config: SolardiConfig = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };
    const projectConfig: Partial<SolardiConfig> = {
      default_agent: "codex",
    };
    const configLoader = createMockConfigLoader(config);
    const projectConfigLoader = createMockProjectConfigLoader(projectConfig);
    const output = jest.fn();

    const code = await executeConfigCommand({ configLoader, projectConfigLoader, output });

    expect(code).toBe(0);

    const allOutput = output.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allOutput).toContain("# Effective Configuration (merged)");
    expect(allOutput).toContain("# Project Overrides (.solardi/config.yaml)");
    expect(allOutput).toContain("default_agent: codex");
  });

  it("shows no overrides message when project config is null", async () => {
    const config: SolardiConfig = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };
    const configLoader = createMockConfigLoader(config);
    const projectConfigLoader = createMockProjectConfigLoader(null);
    const output = jest.fn();

    const code = await executeConfigCommand({ configLoader, projectConfigLoader, output });

    expect(code).toBe(0);

    const allOutput = output.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allOutput).toContain("# No project overrides found");
  });
});
