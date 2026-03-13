import * as path from "path";
import { FileSystem } from "../filesystem/filesystem";

const PROJECT_DIR = ".solito";
const CONFIG_FILE = "config.yaml";
const COMMANDS_DIR = "commands";

export interface WorkspaceInitializer {
  ensureProjectDir(): Promise<void>;
  ensureCommandDir(commandName: string): Promise<string>;
}

export interface WorkspaceInitializerDeps {
  filesystem: FileSystem;
  cwd: string;
}

export class DefaultWorkspaceInitializer implements WorkspaceInitializer {
  private readonly filesystem: FileSystem;
  private readonly cwd: string;

  constructor({ filesystem, cwd }: WorkspaceInitializerDeps) {
    this.filesystem = filesystem;
    this.cwd = cwd;
  }

  async ensureProjectDir(): Promise<void> {
    const projectDir = path.join(this.cwd, PROJECT_DIR);
    const configPath = path.join(projectDir, CONFIG_FILE);

    await this.filesystem.mkdirRecursive(projectDir);

    const configExists = await this.filesystem.exists(configPath);

    if (!configExists) {
      await this.filesystem.writeFile(configPath, "");
    }
  }

  async ensureCommandDir(commandName: string): Promise<string> {
    const commandDir = path.join(
      this.cwd,
      PROJECT_DIR,
      COMMANDS_DIR,
      commandName,
    );

    await this.filesystem.mkdirRecursive(commandDir);
    return commandDir;
  }
}
