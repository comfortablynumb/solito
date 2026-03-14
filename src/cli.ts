#!/usr/bin/env node

import { parseArgs, printUsage } from "./args";
import { getAgent } from "./agents/registry";
import { DefaultFileSystem } from "./filesystem/default-filesystem";
import { YamlConfigLoader } from "./config/yaml-config-loader";
import { DefaultProjectConfigLoader } from "./config/project-config-loader";
import { DefaultWorkspaceInitializer } from "./workspace/workspace-initializer";
import { getConfigDir } from "./util/paths";
import { executeRunCommand } from "./commands/run-command";
import { executeConfigCommand } from "./commands/config-command";
import { DefaultCommandResolver } from "./commands/command-resolver";
import { DefaultVariableResolver } from "./interpolation/variable-resolver";
import * as path from "path";

async function main(): Promise<void> {
  const command = parseArgs(process.argv);
  const filesystem = new DefaultFileSystem();
  const configDir = getConfigDir();
  const cwd = process.cwd();
  const projectConfigLoader = new DefaultProjectConfigLoader({
    filesystem,
    cwd,
  });
  const configLoader = new YamlConfigLoader({
    filesystem,
    configDir,
    projectConfigLoader,
  });

  if (command.kind === "help") {
    printUsage();
    process.exit(0);
  }

  if (command.kind === "config") {
    const code = await executeConfigCommand({
      configLoader,
      output: console.log,
    });
    process.exit(code);
  }

  const config = await configLoader.load();
  const workspace = new DefaultWorkspaceInitializer({ filesystem, cwd });
  await workspace.ensureProjectDir();

  const variableResolver = new DefaultVariableResolver();
  const commandResolver = new DefaultCommandResolver({
    filesystem,
    variableResolver,
    commands: config.commands,
  });

  const resolved = command.rawPrompt
    ? { prompt: command.prompt, isCommand: false, commandName: undefined }
    : await commandResolver.resolve(command.prompt);
  let prompt = resolved.prompt;
  let progressDir: string | undefined;

  if (resolved.isCommand && resolved.commandName) {
    const commandWorkDir = await workspace.ensureCommandDir(resolved.commandName);
    progressDir = commandWorkDir;
    const postResolver = new DefaultVariableResolver({
      builtIns: {
        command_work_dir: commandWorkDir,
        max_turn_time_minutes: String(config.loop.max_turn_time_minutes),
      },
    });
    prompt = postResolver.resolve(prompt);

    const promptFilePath = path.join(commandWorkDir, "prompt.md");
    await filesystem.writeFile(promptFilePath, prompt);
    prompt = `Read the file at ${promptFilePath} and follow all instructions in it precisely. Start working immediately.`;
  }

  const agentName = command.agentName ?? config.default_agent;
  const agent = getAgent(agentName, { verbose: command.verbose });
  const agentConfig = config.agents[agentName] ?? { type: agentName };

  const code = await executeRunCommand({
    agent,
    prompt,
    agentConfig,
    loopConfig: config.loop,
    passthrough: command.passthrough,
    progressDir,
    verbose: command.verbose,
  });

  process.exit(code);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
