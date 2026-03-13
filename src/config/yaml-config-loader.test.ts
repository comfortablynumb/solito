import * as path from "path";
import { stringify } from "yaml";
import { YamlConfigLoader } from "./yaml-config-loader";
import { SolitoConfig } from "./config";
import { createMockFileSystem } from "../test/mock-filesystem";

describe("YamlConfigLoader", () => {
  const configDir = path.join("/home", "user", ".solito");
  const configPath = path.join(configDir, "config.yaml");

  it("creates default config file when none exists", async () => {
    const fs = createMockFileSystem();
    const loader = new YamlConfigLoader({ filesystem: fs, configDir });

    const config = await loader.load();

    expect(config.default_agent).toBe("claude");
    expect(config.loop.max_turn_time_minutes).toBe(10);
    expect(config.agents.claude.type).toBe("claude");
    expect(fs.mkdirRecursive).toHaveBeenCalledWith(configDir);
    expect(fs.writeFile).toHaveBeenCalledWith(configPath, expect.any(String));
  });

  it("reads existing config file", async () => {
    const existing: SolitoConfig = {
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
    expect(config.loop.max_turn_time_minutes).toBe(10);
    expect(config.agents.claude.type).toBe("claude");
  });

  it("preserves append_system_prompt from config", async () => {
    const existing: SolitoConfig = {
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
