import { FileSystem } from "../filesystem/filesystem";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function createMockFileSystem(files: Record<string, string> = {}): FileSystem {
  const store: Record<string, string> = {};

  for (const [key, value] of Object.entries(files)) {
    store[normalizePath(key)] = value;
  }

  return {
    readFile: jest.fn(async (p: string) => {
      const normalized = normalizePath(p);

      if (store[normalized] === undefined) {
        throw new Error(`ENOENT: ${p}`);
      }

      return store[normalized];
    }),
    writeFile: jest.fn(async (p: string, content: string) => {
      store[normalizePath(p)] = content;
    }),
    exists: jest.fn(async (p: string) => normalizePath(p) in store),
    mkdirRecursive: jest.fn(async () => {}),
  };
}
