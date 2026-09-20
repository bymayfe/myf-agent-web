// src/lib/plugins/builtins/patchPlugin.ts
// Cerrahi Yama ve Değiştirme Eklentisi (Surgical Search & Replace / Unified Diff)

import type { MyfPlugin } from "../types";
import { promises as fs } from "fs";
import path from "path";

export const patchPlugin: MyfPlugin = {
  id: "patch-engine",
  name: "Surgical Patch & Diff Engine",
  version: "1.0.0",
  description: "Surgically searches and replaces specific lines instead of rewriting entire files.",
  category: "filesystem",
  icon: "FileCode",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Surgical Patch & Diff Engine]
To modify only a few lines in a large file, use 'search_and_replace' instead of rewriting the entire file.`;
  },

  tools: [
    {
      name: "search_and_replace",
      displayName: "Search and Replace (Surgical Patch)",
      description: "Searches for a target block of text within the specified file and replaces it with new content.",
      parameters: {
        path: {
          type: "string",
          description: "Path of the file to modify (e.g. 'src/app/page.tsx')",
          required: true,
        },
        search_block: {
          type: "string",
          description: "Exact block of text in the file to search and replace",
          required: true,
        },
        replace_block: {
          type: "string",
          description: "New block of text to replace the target block",
          required: true,
        },
      },
      execute: async (params, context) => {
        const relPath = String(params.path || "").trim();
        const searchBlock = String(params.search_block || "");
        const replaceBlock = String(params.replace_block || "");

        if (!relPath) return { success: false, output: "File path is required." };
        if (!searchBlock) return { success: false, output: "Search block cannot be empty." };

        const rootDir = context.projectDir || process.cwd();
        const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(rootDir, relPath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          if (!content.includes(searchBlock)) {
            return {
              success: false,
              output: `Target search block not found in file (${relPath}). Please verify the exact lines.`,
            };
          }

          const updated = content.replace(searchBlock, replaceBlock);
          await fs.writeFile(fullPath, updated, "utf-8");

          return {
            success: true,
            output: `File (${relPath}) was surgically patched and updated successfully.`,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `Patch failed: ${msg}` };
        }
      },
    },
  ],
};
