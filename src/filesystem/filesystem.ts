export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirRecursive(path: string): Promise<void>;
  listDirectories(path: string): Promise<string[]>;
  listFiles(path: string): Promise<string[]>;
}
