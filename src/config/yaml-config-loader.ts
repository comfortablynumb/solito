import { stringify, parse } from "yaml";
import { ConfigLoader, SolitoConfig } from "./config";
import { FileSystem } from "../filesystem/filesystem";
import { getConfigFilePath } from "../util/paths";
import { createDefaultConfig, mergeWithDefaults } from "./default-config";
import { validateConfig } from "./config-schema";
import { Logger, ConsoleLogger } from "../util/logger";
import { ProjectConfigLoader } from "./project-config-loader";
import { mergeProjectConfig } from "./config-merger";

export interface YamlConfigLoaderDeps {
  filesystem: FileSystem;
  configDir: string;
  logger?: Logger;
  projectConfigLoader?: ProjectConfigLoader;
}

export class YamlConfigLoader implements ConfigLoader {
  private readonly filesystem: FileSystem;
  private readonly configPath: string;
  private readonly configDir: string;
  private readonly logger: Logger;
  private readonly projectConfigLoader?: ProjectConfigLoader;

  constructor({ filesystem, configDir, logger, projectConfigLoader }: YamlConfigLoaderDeps) {
    this.filesystem = filesystem;
    this.configDir = configDir;
    this.configPath = getConfigFilePath(configDir);
    this.logger = logger ?? new ConsoleLogger();
    this.projectConfigLoader = projectConfigLoader;
  }

  async load(): Promise<SolitoConfig> {
    const exists = await this.filesystem.exists(this.configPath);
    let globalConfig: SolitoConfig;

    if (!exists) {
      globalConfig = await this.createDefaultConfigFile();
    } else {
      globalConfig = await this.readConfigFile();
    }

    return this.applyProjectConfig(globalConfig);
  }

  private async applyProjectConfig(globalConfig: SolitoConfig): Promise<SolitoConfig> {
    if (!this.projectConfigLoader) {
      return globalConfig;
    }

    const projectConfig = await this.projectConfigLoader.load();

    if (!projectConfig) {
      return globalConfig;
    }

    this.logger.info("Loaded project config from .solito/config.yaml");
    return mergeProjectConfig(globalConfig, projectConfig);
  }

  private async createDefaultConfigFile(): Promise<SolitoConfig> {
    const config = createDefaultConfig();
    const yaml = stringify(config);
    await this.filesystem.mkdirRecursive(this.configDir);
    await this.filesystem.writeFile(this.configPath, yaml);
    return config;
  }

  private async readConfigFile(): Promise<SolitoConfig> {
    const content = await this.filesystem.readFile(this.configPath);
    const parsed = parse(content) as Partial<SolitoConfig>;
    const merged = mergeWithDefaults(parsed);

    const validation = validateConfig(merged);

    if (!validation.success) {
      const details = validation.errors?.join(", ") ?? "unknown error";
      this.logger.warn(`Warning: config validation failed (${details}), using defaults for invalid fields`);
    }

    return merged;
  }
}
