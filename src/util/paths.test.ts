import * as path from "path";
import { getConfigDir, getConfigFilePath } from "./paths";

describe("getConfigDir", () => {
  it("returns .solito under provided home dir", () => {
    const result = getConfigDir("/home/user");

    expect(result).toBe(path.join("/home/user", ".solito"));
  });

  it("throws when home directory cannot be determined", () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    delete process.env.HOME;
    delete process.env.USERPROFILE;

    try {
      expect(() => getConfigDir("")).toThrow("Cannot determine home directory");
    } finally {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
    }
  });
});

describe("getConfigFilePath", () => {
  it("returns config.yaml under config dir", () => {
    const result = getConfigFilePath("/home/user/.solito");

    expect(result).toBe(path.join("/home/user/.solito", "config.yaml"));
  });
});
