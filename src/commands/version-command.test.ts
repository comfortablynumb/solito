import { executeVersionCommand } from "./version-command";

describe("executeVersionCommand", () => {
  it("prints solardi with semver version", async () => {
    const output = jest.fn();
    await executeVersionCommand({ output });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0][0]).toMatch(/^solardi \d+\.\d+\.\d+/);
  });

  it("returns exit code 0", async () => {
    const code = await executeVersionCommand({ output: jest.fn() });
    expect(code).toBe(0);
  });
});
