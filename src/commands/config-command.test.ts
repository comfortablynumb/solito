import { executeConfigCommand } from "./config-command";
import { ConfigLoader, SolitoConfig } from "../config/config";

function createMockConfigLoader(config: SolitoConfig): ConfigLoader {
  return {
    load: jest.fn().mockResolvedValue(config),
  };
}

describe("executeConfigCommand", () => {
  it("outputs config as YAML and returns 0", async () => {
    const config: SolitoConfig = {
      default_agent: "claude",
      loop: { max_turn_time_minutes: 10 },
      agents: { claude: { type: "claude" } },
    };
    const configLoader = createMockConfigLoader(config);
    const output = jest.fn();

    const code = await executeConfigCommand({ configLoader, output });

    expect(code).toBe(0);
    expect(output).toHaveBeenCalledTimes(1);

    const yaml = output.mock.calls[0][0] as string;
    expect(yaml).toContain("default_agent: claude");
    expect(yaml).toContain("max_turn_time_minutes: 10");
  });
});
