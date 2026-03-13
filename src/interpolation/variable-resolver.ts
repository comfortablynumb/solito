import * as path from "path";
import * as fs from "fs";
import { CommandVariables } from "../config/config";

export interface VariableResolver {
  resolve(template: string, variables?: CommandVariables): string;
}

export interface VariableResolverOptions {
  solitoRootDir?: string;
  builtIns?: Record<string, string>;
}

export class DefaultVariableResolver implements VariableResolver {
  private readonly solitoRootDir: string;
  private readonly builtIns: Record<string, string>;

  constructor(options?: VariableResolverOptions) {
    this.solitoRootDir = options?.solitoRootDir ?? findSolitoRootDir();
    this.builtIns = options?.builtIns ?? {};
  }

  resolve(template: string, variables?: CommandVariables): string {
    return template.replace(/\$\{(var|env):([^}]+)\}/g, (match, type, key) => {
      if (type === "env") {
        return resolveEnvVar(key, match);
      }

      return this.resolveVar(key, variables, match);
    });
  }

  private resolveVar(
    key: string,
    variables: CommandVariables | undefined,
    fallback: string,
  ): string {
    if (key === "solito_root_dir") {
      return this.solitoRootDir;
    }

    if (this.builtIns[key] !== undefined) {
      return this.builtIns[key];
    }

    if (!variables) {
      return fallback;
    }

    const value = getNestedValue(variables, key);

    if (value === undefined) {
      return fallback;
    }

    return String(value);
  }
}

function resolveEnvVar(key: string, fallback: string): string {
  const value = process.env[key];
  return value ?? fallback;
}

export function getNestedValue(
  obj: CommandVariables,
  dotPath: string,
): string | number | boolean | undefined {
  const keys = dotPath.split(".");
  let current: CommandVariables | string | number | boolean = obj;

  for (const key of keys) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    const value: string | number | boolean | CommandVariables | undefined =
      (current as CommandVariables)[key];

    if (value === undefined) {
      return undefined;
    }

    current = value;
  }

  if (typeof current === "object") {
    return undefined;
  }

  return current;
}

function findSolitoRootDir(): string {
  let dir = __dirname;

  while (true) {
    const pkgPath = path.join(dir, "package.json");

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

        if (pkg.name === "solito") {
          return dir;
        }
      } catch {
        // skip invalid package.json
      }
    }

    const parent = path.dirname(dir);

    if (parent === dir) {
      return path.resolve(__dirname, "..");
    }

    dir = parent;
  }
}
