import { stringify } from "yaml";
import { ConfigLoader } from "../config/config";

export interface ConfigCommandDeps {
  configLoader: ConfigLoader;
  output: (text: string) => void;
}

export async function executeConfigCommand(deps: ConfigCommandDeps): Promise<number> {
  const config = await deps.configLoader.load();
  const yaml = stringify(config);
  deps.output(yaml);
  return 0;
}
