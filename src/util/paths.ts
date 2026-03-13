import * as path from "path";

export function getConfigDir(homeDir?: string): string {
  const home = homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "";

  if (!home) {
    throw new Error("Cannot determine home directory (HOME or USERPROFILE)");
  }

  return path.join(home, ".solito");
}

export function getConfigFilePath(configDir: string): string {
  return path.join(configDir, "config.yaml");
}
