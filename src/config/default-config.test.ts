import { createDefaultConfig, mergeWithDefaults } from "./default-config";

describe("createDefaultConfig", () => {
  it("returns config with claude as default agent", () => {
    const config = createDefaultConfig();

    expect(config.default_agent).toBe("claude");
  });

  it("returns config with 10 minute loop time", () => {
    const config = createDefaultConfig();

    expect(config.loop.max_turn_time_minutes).toBe(10);
  });

  it("includes claude agent entry", () => {
    const config = createDefaultConfig();

    expect(config.agents.claude).toEqual({ type: "claude" });
  });

  it("includes build command with specs_dir default", () => {
    const config = createDefaultConfig();

    expect(config.commands?.build).toBeDefined();
    expect(config.commands?.build.prompt).toContain("prompts/build.md");
    expect(config.commands?.build.variables?.specs_dir).toBe("specs");
    expect(config.commands?.build.variables?.max_consecutive_failures).toBe(5);
  });
});

describe("mergeWithDefaults", () => {
  it("uses defaults for empty partial", () => {
    const config = mergeWithDefaults({});

    expect(config.default_agent).toBe("claude");
    expect(config.loop.max_turn_time_minutes).toBe(10);
    expect(config.agents.claude.type).toBe("claude");
  });

  it("overrides default_agent from partial", () => {
    const config = mergeWithDefaults({ default_agent: "codex" });

    expect(config.default_agent).toBe("codex");
  });

  it("overrides loop config from partial", () => {
    const config = mergeWithDefaults({
      loop: { max_turn_time_minutes: 15 },
    });

    expect(config.loop.max_turn_time_minutes).toBe(15);
  });

  it("merges agents with defaults", () => {
    const config = mergeWithDefaults({
      agents: { codex: { type: "codex" } },
    });

    expect(config.agents.claude.type).toBe("claude");
    expect(config.agents.codex.type).toBe("codex");
  });

  it("overrides default agent config with partial agent config", () => {
    const config = mergeWithDefaults({
      agents: {
        claude: { type: "claude", append_system_prompt: "Be concise" },
      },
    });

    expect(config.agents.claude.append_system_prompt).toBe("Be concise");
  });
});
