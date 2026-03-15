import * as childProcess from "child_process";

import { commandExists } from "./command";

jest.mock("child_process", () => ({
  execFile: jest.fn(),
}));

describe("commandExists", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("uses 'where' on Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    (childProcess.execFile as unknown as jest.Mock).mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
        cb(null);
      },
    );

    const result = await commandExists("node");

    expect(childProcess.execFile).toHaveBeenCalledWith(
      "where", ["node"], expect.any(Object), expect.any(Function),
    );
    expect(result).toBe(true);
  });

  it("uses 'which' on Unix", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (childProcess.execFile as unknown as jest.Mock).mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
        cb(null);
      },
    );

    const result = await commandExists("node");

    expect(childProcess.execFile).toHaveBeenCalledWith(
      "which", ["node"], expect.any(Object), expect.any(Function),
    );
    expect(result).toBe(true);
  });

  it("returns false when command does not exist", async () => {
    (childProcess.execFile as unknown as jest.Mock).mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
        cb(new Error("not found"));
      },
    );

    const result = await commandExists("nonexistent");

    expect(result).toBe(false);
  });
});
