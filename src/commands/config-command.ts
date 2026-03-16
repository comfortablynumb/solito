import { stringify } from "yaml";
import { ConfigLoader } from "../config/config";
import { ProjectConfigLoader } from "../config/project-config-loader";

export interface ConfigCommandDeps {
  configLoader: ConfigLoader;
  projectConfigLoader?: ProjectConfigLoader;
  output: (text: string) => void;
}

export async function executeConfigCommand(deps: ConfigCommandDeps): Promise<number> {
  const config = await deps.configLoader.load();
  deps.output("# Effective Configuration (merged)");
  deps.output(stringify(config));

  if (deps.projectConfigLoader) {
    const projectConfig = await deps.projectConfigLoader.load();

    if (projectConfig) {
      deps.output("# Project Overrides (.solardi/config.yaml)");
      deps.output(stringify(projectConfig));
    } else {
      deps.output("# No project overrides found");
    }
  }

  return 0;
}
