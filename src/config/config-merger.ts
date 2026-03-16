import { SolardiConfig } from "./config";

export function mergeProjectConfig(
  global: SolardiConfig,
  project: Partial<SolardiConfig>,
): SolardiConfig {
  return {
    default_agent: project.default_agent ?? global.default_agent,
    loop: {
      max_turn_time_minutes:
        project.loop?.max_turn_time_minutes ?? global.loop.max_turn_time_minutes,
      continue_prompt:
        project.loop?.continue_prompt ?? global.loop.continue_prompt,
      timeout_prompt:
        project.loop?.timeout_prompt ?? global.loop.timeout_prompt,
      stale: project.loop?.stale ?? global.loop.stale,
    },
    agents: {
      ...global.agents,
      ...project.agents,
    },
    commands: {
      ...global.commands,
      ...project.commands,
    },
  };
}
