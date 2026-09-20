// src/lib/plugins/builtins/fsPlugin.ts
// Dosya Sistemi Operasyonları Eklentisi (Read, Write, List, Find)

import type { MyfPlugin } from "../types";
import { promises as fs } from "fs";
import path from "path";

export const fsPlugin: MyfPlugin = {
  id: "fs-ops",
  name: "File System (FS Tools)",
  version: "1.0.0",
  description: "Safely reads, writes, and lists files in the project directory.",
  category: "filesystem",
  icon: "Files",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: File System (FS Tools)]
Use 'read_file' to inspect file content, 'write_file' to create or update files, and 'list_directory' to list files and folders.`;
  },

  tools: [
    {
      name: "read_file",
      displayName: "Read File",
      description: "Reads the content of the specified file.",
      parameters: {
        filePath: {
          type: "string",
          description: "Relative or absolute path of the file to read",
          required: true,
        },
      },
      execute: async (params, context) => {
        const rawPath = String(params.filePath || params.path || params.file || "").trim();
        if (!rawPath) return { success: false, output: "File path is required." };

        const target = path.isAbsolute(rawPath) ? rawPath : path.join(context.projectDir, rawPath);
        try {
          const content = await fs.readFile(target, "utf-8");
          const lines = content.split("\n");
          if (lines.length > 800) {
            return {
              success: true,
              output: `📄 File: ${rawPath} (${lines.length} lines — showing first 800):\n\n` + lines.slice(0, 800).join("\n"),
            };
          }
          return {
            success: true,
            output: `📄 File: ${rawPath} (${lines.length} lines):\n\n${content}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not read file: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
    {
      name: "write_file",
      displayName: "Write / Update File",
      description: "Creates or overwrites the specified file with the given content.",
      parameters: {
        filePath: {
          type: "string",
          description: "Path of the file to write",
          required: true,
        },
        content: {
          type: "string",
          description: "Complete code or text content to write to the file",
          required: true,
        },
      },
      execute: async (params, context) => {
        const rawPath = String(params.filePath || params.path || params.file || "").trim();
        const content = String(params.content ?? "");
        if (!rawPath) return { success: false, output: "File path is required." };

        const target = path.isAbsolute(rawPath) ? rawPath : path.join(context.projectDir, rawPath);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, content, "utf-8");
          const lines = content.split("\n").length;
          return {
            success: true,
            output: `✅ File saved successfully: ${rawPath} (${lines} lines)`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not write file: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
    {
      name: "list_directory",
      displayName: "List Directory",
      description: "Lists files and subdirectories in the specified directory.",
      parameters: {
        dirPath: {
          type: "string",
          description: "Directory path to list (default: project root)",
        },
      },
      execute: async (params, context) => {
        const rawPath = String(params.dirPath || "").trim();
        const target = rawPath ? (path.isAbsolute(rawPath) ? rawPath : path.join(context.projectDir, rawPath)) : context.projectDir;

        try {
          const entries = await fs.readdir(target, { withFileTypes: true });
          const items = entries.map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
          return {
            success: true,
            output: `📂 Directory: ${rawPath || "."}\n` + (items.join("\n") || "(Directory is empty — no files to inspect. If creating a new project, stop searching and start creating files.)"),
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not list directory: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
  ],
};
