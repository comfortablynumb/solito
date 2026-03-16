import { mergeProjectConfig } from "./config-merger";
import { SolardiConfig } from "./config";

function createBaseConfig(): SolardiConfig {
  return {
    default_agent: "claude",
    loop: {
      max_turn_time_minutes: 10,
      continue_prompt: "Continue.",
      timeout_prompt: "Timeout.",
    },
    agents: { claude: { type: "claude" } },
    commands: {
      quality: { prompt: "/global/quality.md" },
    },
  };
}

describe("mergeProjectConfig", () => {
  it("returns global config when project is empty", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {});

    expect(result.default_agent).toBe("claude");
    expect(result.loop.max_turn_time_minutes).toBe(10);
  });

  it("overrides default_agent from project", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, { default_agent: "codex" });

    expect(result.default_agent).toBe("codex");
  });

  it("overrides loop fields from project", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {
      loop: { max_turn_time_minutes: 30 },
    });

    expect(result.loop.max_turn_time_minutes).toBe(30);
    expect(result.loop.continue_prompt).toBe("Continue.");
  });

  it("merges agents from both configs", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {
      agents: { codex: { type: "codex" } },
    });

    expect(result.agents.claude).toBeDefined();
    expect(result.agents.codex).toBeDefined();
  });

  it("project agent overrides global agent of same name", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {
      agents: {
        claude: { type: "claude", append_system_prompt: "project prompt" },
      },
    });

    expect(result.agents.claude.append_system_prompt).toBe("project prompt");
  });

  it("merges commands from both configs", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {
      commands: { lint: { prompt: "/project/lint.md" } },
    });

    expect(result.commands?.quality).toBeDefined();
    expect(result.commands?.lint).toBeDefined();
  });

  it("project command overrides global command of same name", () => {
    const global = createBaseConfig();
    const result = mergeProjectConfig(global, {
      commands: { quality: { prompt: "/project/quality.md" } },
    });

    expect(result.commands?.quality.prompt).toBe("/project/quality.md");
  });
});
