import * as path from "path";
import { parse } from "yaml";
import { SolardiConfig } from "./config";
import { FileSystem } from "../filesystem/filesystem";

const PROJECT_CONFIG_DIR = ".solardi";
const PROJECT_CONFIG_FILE = "config.yaml";

export interface ProjectConfigLoader {
  load(): Promise<Partial<SolardiConfig> | null>;
}

export interface ProjectConfigLoaderDeps {
  filesystem: FileSystem;
  cwd: string;
}

export class DefaultProjectConfigLoader implements ProjectConfigLoader {
  private readonly filesystem: FileSystem;
  private readonly configPath: string;

  constructor({ filesystem, cwd }: ProjectConfigLoaderDeps) {
    this.filesystem = filesystem;
    this.configPath = path.join(cwd, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
  }

  async load(): Promise<Partial<SolardiConfig> | null> {
    const exists = await this.filesystem.exists(this.configPath);

    if (!exists) {
      return null;
    }

    const content = await this.filesystem.readFile(this.configPath);
    return parse(content) as Partial<SolardiConfig>;
  }
}
