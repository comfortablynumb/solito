import packageJson from "../../package.json";

export interface VersionCommandDeps {
  output: (text: string) => void;
}

export async function executeVersionCommand(deps: VersionCommandDeps): Promise<number> {
  deps.output(`solardi ${packageJson.version}`);
  return 0;
}
