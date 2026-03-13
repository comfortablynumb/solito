import * as fs from "fs/promises";
import { FileSystem } from "./filesystem";

function isEnoentError(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

export class DefaultFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch (err) {
      if (isEnoentError(err)) {
        return false;
      }

      throw err;
    }
  }

  async mkdirRecursive(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }
}
