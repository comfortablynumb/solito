import * as fs from "fs";
import * as path from "path";

jest.mock("fs");

const mockFs = jest.mocked(fs);

describe("findSolardiRootDir (via DefaultVariableResolver default)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("finds solardi root by walking up to package.json with name=solardi", () => {
    // The function starts from __dirname of variable-resolver.ts which is src/interpolation
    // and walks up. We need to simulate finding package.json at the project root.
    const solardiRoot = path.resolve(__dirname, "..");

    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();

      if (pathStr === path.join(solardiRoot, "package.json")) {
        return true;
      }

      // Also return true for the __dirname level to test non-solardi package.json
      if (pathStr === path.join(__dirname, "package.json")) {
        return true;
      }

      return false;
    });

    mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      const pathStr = p.toString();

      if (pathStr === path.join(__dirname, "package.json")) {
        return JSON.stringify({ name: "not-solardi" });
      }

      if (pathStr === path.join(solardiRoot, "package.json")) {
        return JSON.stringify({ name: "solardi" });
      }

      throw new Error("file not found");
    });

    // Re-import to trigger findSolardiRootDir
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultVariableResolver } = require("./variable-resolver");
      const resolver = new DefaultVariableResolver();

      // Should resolve to the project root
      const result = resolver.resolve("${var:solardi_root_dir}");
      expect(result).toBe(solardiRoot);
    });
  });

  it("falls back to parent of __dirname when no solardi package.json found", () => {
    mockFs.existsSync.mockReturnValue(false);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultVariableResolver } = require("./variable-resolver");
      const resolver = new DefaultVariableResolver();
      const result = resolver.resolve("${var:solardi_root_dir}");
      expect(result).toBe(path.resolve(__dirname, ".."));
    });
  });

  it("skips invalid package.json files", () => {
    const solardiRoot = path.resolve(__dirname, "..");

    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();

      if (pathStr === path.join(__dirname, "package.json")) {
        return true;
      }

      if (pathStr === path.join(solardiRoot, "package.json")) {
        return true;
      }

      return false;
    });

    mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      const pathStr = p.toString();

      if (pathStr === path.join(__dirname, "package.json")) {
        return "{ invalid json";
      }

      if (pathStr === path.join(solardiRoot, "package.json")) {
        return JSON.stringify({ name: "solardi" });
      }

      throw new Error("not found");
    });

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultVariableResolver } = require("./variable-resolver");
      const resolver = new DefaultVariableResolver();
      const result = resolver.resolve("${var:solardi_root_dir}");
      expect(result).toBe(solardiRoot);
    });
  });
});
