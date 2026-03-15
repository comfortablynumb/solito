import { DefaultFileSystem } from "./default-filesystem";
import * as fs from "fs/promises";

jest.mock("fs/promises");

const mockFs = jest.mocked(fs);

describe("DefaultFileSystem", () => {
  let filesystem: DefaultFileSystem;

  beforeEach(() => {
    jest.resetAllMocks();
    filesystem = new DefaultFileSystem();
  });

  describe("readFile", () => {
    it("reads file content as utf-8", async () => {
      mockFs.readFile.mockResolvedValue("file content");

      const result = await filesystem.readFile("/some/path.txt");

      expect(result).toBe("file content");
      expect(mockFs.readFile).toHaveBeenCalledWith("/some/path.txt", "utf-8");
    });
  });

  describe("writeFile", () => {
    it("writes content as utf-8", async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await filesystem.writeFile("/some/path.txt", "content");

      expect(mockFs.writeFile).toHaveBeenCalledWith("/some/path.txt", "content", "utf-8");
    });
  });

  describe("exists", () => {
    it("returns true when file exists", async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await filesystem.exists("/existing/file");

      expect(result).toBe(true);
    });

    it("returns false when ENOENT error", async () => {
      const err = new Error("not found") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      mockFs.access.mockRejectedValue(err);

      const result = await filesystem.exists("/missing/file");

      expect(result).toBe(false);
    });

    it("throws non-ENOENT errors", async () => {
      const err = new Error("permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      mockFs.access.mockRejectedValue(err);

      await expect(filesystem.exists("/forbidden/file")).rejects.toThrow("permission denied");
    });

    it("throws when error is not an Error instance", async () => {
      mockFs.access.mockRejectedValue("string error");

      await expect(filesystem.exists("/some/file")).rejects.toBe("string error");
    });
  });

  describe("mkdirRecursive", () => {
    it("creates directory recursively", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await filesystem.mkdirRecursive("/deep/nested/dir");

      expect(mockFs.mkdir).toHaveBeenCalledWith("/deep/nested/dir", { recursive: true });
    });
  });

  describe("listDirectories", () => {
    it("returns directory names only", async () => {
      const entries = [
        { name: "dir1", isDirectory: () => true },
        { name: "file1.txt", isDirectory: () => false },
        { name: "dir2", isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
      mockFs.readdir.mockResolvedValue(entries);

      const result = await filesystem.listDirectories("/some/path");

      expect(result).toEqual(["dir1", "dir2"]);
    });

    it("returns empty array when ENOENT", async () => {
      const err = new Error("not found") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      mockFs.readdir.mockRejectedValue(err);

      const result = await filesystem.listDirectories("/missing/dir");

      expect(result).toEqual([]);
    });

    it("throws non-ENOENT errors", async () => {
      const err = new Error("permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      mockFs.readdir.mockRejectedValue(err);

      await expect(filesystem.listDirectories("/forbidden/dir")).rejects.toThrow("permission denied");
    });
  });
});
