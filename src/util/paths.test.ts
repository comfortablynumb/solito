import * as path from "path";
import { getConfigDir, getConfigFilePath } from "./paths";

describe("getConfigDir", () => {
  it("returns .solito under provided home dir", () => {
    const result = getConfigDir("/home/user");

    expect(result).toBe(path.join("/home/user", ".solito"));
  });

  it("falls back to HOME env var when homeDir is not provided", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/fallback/home";

    try {
      const result = getConfigDir();
      expect(result).toBe(path.join("/fallback/home", ".solito"));
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("falls back to USERPROFILE when HOME is not set", () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    delete process.env.HOME;
    process.env.USERPROFILE = "/user/profile";

    try {
      const result = getConfigDir();
      expect(result).toBe(path.join("/user/profile", ".solito"));
    } finally {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  it("throws when home directory cannot be determined (empty string)", () => {
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

  it("throws when no homeDir arg and no env vars are set", () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    delete process.env.HOME;
    delete process.env.USERPROFILE;

    try {
      expect(() => getConfigDir()).toThrow("Cannot determine home directory");
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
