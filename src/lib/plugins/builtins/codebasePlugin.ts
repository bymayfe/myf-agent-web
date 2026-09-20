// src/lib/plugins/builtins/codebasePlugin.ts
// Codebase Map & Sembol Arama Eklentisi

import type { MyfPlugin } from "../types";
import { buildCodebaseMap, formatMapForLLM, searchMap } from "@/lib/codebaseMap";

export const codebasePlugin: MyfPlugin = {
  id: "codebase-intel",
  name: "Codebase Memory & Map",
  version: "1.0.0",
  description: "Scans the project codebase map, quickly finding functions, classes, and interfaces without wasting tokens.",
  category: "codebase",
  icon: "Cpu",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Codebase Memory & Map]
Use 'search_symbols' and 'get_codebase_summary' to quickly scan files and symbols in the project without wasting tokens.`;
  },

  tools: [
    {
      name: "search_symbols",
      displayName: "Search Symbols (Function/Class)",
      description: "Searches across the project for functions, classes, types, or file names.",
      parameters: {
        query: {
          type: "string",
          description: "Symbol name or search query (e.g. 'Coordinator', 'useChat', 'buildPrompt')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const query = String(params.query || "").trim();
        if (!query) return { success: false, output: "Search query cannot be empty." };

        try {
          const map = await buildCodebaseMap(context.projectDir);
          const results = searchMap(map, query);

          if (results.length === 0) {
            return {
              success: true,
              output: `No symbol or file found matching "${query}" (${map.fileCount} files scanned).`,
            };
          }

          const lines = [`🔎 ${results.length} files/symbols matching "${query}":\n`];
          results.slice(0, 15).forEach((r) => {
            const syms = r.symbols.length > 0 ? ` → Symbols: [${r.symbols.slice(0, 8).join(", ")}]` : "";
            lines.push(`📄 ${r.path} (${r.lines} lines, ${r.lang})${syms}`);
          });

          return {
            success: true,
            output: lines.join("\n"),
            data: results,
          };
        } catch (err) {
          return {
            success: false,
            output: `Symbol search error: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
    {
      name: "get_codebase_summary",
      displayName: "Codebase Summary",
      description: "Returns a compact file and symbol map of the entire project.",
      parameters: {},
      execute: async (_params, context) => {
        try {
          const map = await buildCodebaseMap(context.projectDir);
          const summary = formatMapForLLM(map, 60);
          return {
            success: true,
            output: summary,
          };
        } catch (err) {
          return {
            success: false,
            output: `Could not generate codebase map: ${err instanceof Error ? err.message : "Error"}`,
          };
        }
      },
    },
  ],
};
