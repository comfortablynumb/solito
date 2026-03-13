import { validateConfig } from "./config-schema";

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    const config = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };

    const result = validateConfig(config);

    expect(result.success).toBe(true);
    expect(result.config).toEqual(config);
  });

  it("accepts config with append_system_prompt", () => {
    const config = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: {
        claude: { type: "claude", append_system_prompt: "Be concise" },
      },
    };

    const result = validateConfig(config);

    expect(result.success).toBe(true);
  });

  it("rejects missing default_agent", () => {
    const config = {
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };

    const result = validateConfig(config);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes("default_agent"))).toBe(true);
  });

  it("rejects negative max_turn_time_minutes", () => {
    const config = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: -1 },
      agents: { claude: { type: "claude" } },
    };

    const result = validateConfig(config);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("rejects agent config missing type", () => {
    const config = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: {} },
    };

    const result = validateConfig(config);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("rejects non-object input", () => {
    const result = validateConfig("not an object");

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
