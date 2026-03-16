import { DefaultWorkspaceInitializer } from "./workspace-initializer";
import { createMockFileSystem } from "../test/mock-filesystem";

describe("DefaultWorkspaceInitializer", () => {
  describe("ensureProjectDir", () => {
    it("creates .solardi dir and empty config.yaml when missing", async () => {
      const filesystem = createMockFileSystem();
      const initializer = new DefaultWorkspaceInitializer({
        filesystem,
        cwd: "/project",
      });

      await initializer.ensureProjectDir();

      expect(filesystem.mkdirRecursive).toHaveBeenCalledWith(
        expect.stringContaining(".solardi"),
      );
      expect(filesystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("config.yaml"),
        "",
      );
    });

    it("does not overwrite existing config.yaml", async () => {
      const filesystem = createMockFileSystem({
        "/project/.solardi/config.yaml": "default_agent: codex",
      });
      const initializer = new DefaultWorkspaceInitializer({
        filesystem,
        cwd: "/project",
      });

      await initializer.ensureProjectDir();

      expect(filesystem.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("ensureCommandDir", () => {
    it("creates .solardi/commands/{name} directory", async () => {
      const filesystem = createMockFileSystem();
      const initializer = new DefaultWorkspaceInitializer({
        filesystem,
        cwd: "/project",
      });

      const result = await initializer.ensureCommandDir("quality");

      expect(filesystem.mkdirRecursive).toHaveBeenCalledWith(
        expect.stringContaining("quality"),
      );
      expect(result).toContain("quality");
      expect(result).toContain(".solardi");
      expect(result).toContain("commands");
    });
  });
});
