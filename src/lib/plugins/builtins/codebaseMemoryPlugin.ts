// src/lib/plugins/builtins/codebaseMemoryPlugin.ts
// DeusData/codebase-memory-mcp tabanlı Bilgi Grafiği ve Sembol Arama Eklentisi.

import type { MyfPlugin } from "../types";
import { codebaseMemoryClient } from "@/lib/codebaseMemoryClient";
import { buildCodebaseMap } from "@/lib/codebaseMap";
import type { FileEntry } from "@/lib/codebaseMap";

export const codebaseMemoryPlugin: MyfPlugin = {
  id: "codebase-memory",
  name: "Codebase Memory (MCP Knowledge Graph)",
  version: "1.0.0",
  description: "Queries project architecture, symbol graph, call paths, and function connections via MCP graph.",
  category: "codebase",
  icon: "Brain",
  enabled: true,
  author: "MYF Agent Core & DeusData",

  systemPromptContribution: () => {
    return `[PLUGIN: Codebase Memory (MCP Knowledge Graph)]
Use 'search_graph', 'trace_path', 'get_architecture', and 'get_code_snippet' to query project architecture, symbols, and function call chains (who calls what).`;
  },

  tools: [
    {
      name: "list_projects",
      displayName: "List Indexed Projects",
      description: "Lists all indexed projects in codebase-memory-mcp knowledge graph.",
      parameters: {},
      execute: async () => {
        if (await codebaseMemoryClient.isAvailable()) {
          const res = await codebaseMemoryClient.listProjects();
          if (res) {
            return {
              success: true,
              output: res,
            };
          }
        }
        return {
          success: false,
          output: JSON.stringify({ error: "Codebase Memory MCP servisi çalışmıyor veya proje listesi boş." }, null, 2),
        };
      },
    },
    {
      name: "search_graph",
      displayName: "Search Symbol/Function in Graph",
      description: "Searches functions, classes, routes, or variables in the Codebase Memory knowledge graph.",
      parameters: {
        query: {
          type: "string",
          description: "Symbol name or regex to search (e.g. 'OrderHandler', 'useCoordinatorChat')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const query = String(params.query || "").trim();
        const rootDir = context.projectDir || process.cwd();

        // 1. Önce MCP binary üzerinden sorgula
        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const mcpResult = await codebaseMemoryClient.searchGraph(query, rootDir);
          if (mcpResult) {
            return {
              success: true,
              output: mcpResult,
            };
          }
        }

        // 2. Fallback: Yerel AST haritasından ara
        const map = await buildCodebaseMap(rootDir);
        const fileList: FileEntry[] = Object.values(map.files);
        const q = query.toLowerCase();
        const matched = fileList.filter(
          (f) => f.path.toLowerCase().includes(q) || f.symbols.some((s) => s.toLowerCase().includes(q))
        );

        if (matched.length === 0) {
          return { success: true, output: `No symbol found matching "${query}".` };
        }

        return {
          success: true,
          output: `[Local AST Symbol Search]: "${query}" (${matched.length} files):\n` +
            matched.map((f) => `- ${f.path} (${f.symbols.join(", ") || "no symbols"})`).join("\n"),
        };
      },
    },
    {
      name: "trace_path",
      displayName: "Trace Call Path",
      description: "Traces who calls a function (inbound) or what a function calls (outbound) in the knowledge graph.",
      parameters: {
        symbol: {
          type: "string",
          description: "Function or class name to trace",
          required: true,
        },
        direction: {
          type: "string",
          description: "Direction: 'inbound' (who calls), 'outbound' (what it calls), or 'both'",
          default: "both",
        },
      },
      execute: async (params, context) => {
        const symbol = String(params.symbol || "").trim();
        const dir = (String(params.direction || "both").toLowerCase()) as "inbound" | "outbound" | "both";
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.tracePath(symbol, dir, rootDir);
          if (res) {
            return {
              success: true,
              output: res,
            };
          }
        }

        return {
          success: true,
          output: `Could not extract call chain for "${symbol}" (MCP graph may not be indexed yet).`,
        };
      },
    },
    {
      name: "get_code_snippet",
      displayName: "Get Symbol Code Snippet",
      description: "Returns the full body and source code of the specified qualified symbol (qualified_name).",
      parameters: {
        qualified_name: {
          type: "string",
          description: "Qualified name of the symbol (e.g. 'src/app/page.Home' or 'lib/store.getSettings')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const qName = String(params.qualified_name || "").trim();
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.getCodeSnippet(qName, rootDir);
          if (res) {
            return { success: true, output: res };
          }
        }

        return {
          success: false,
          output: `Could not read source code for symbol "${qName}" via MCP.`,
        };
      },
    },
    {
      name: "get_architecture",
      displayName: "Project Architecture Graph",
      description: "Returns the full architectural structure, entry points, and main components from the knowledge graph.",
      parameters: {},
      execute: async (_params, context) => {
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.getArchitecture(rootDir);
          if (res) {
            return {
              success: true,
              output: res,
            };
          }
        }

        const map = await buildCodebaseMap(rootDir);
        const fileList: FileEntry[] = Object.values(map.files);
        return {
          success: true,
          output: `[Local AST Architecture Summary] (${map.fileCount} files, ${map.totalLines} lines):\n` +
            fileList.slice(0, 30).map((f) => `- ${f.path} (${f.lines} lines)`).join("\n"),
        };
      },
    },
    {
      name: "get_codebase_summary",
      displayName: "Codebase Map & Summary",
      description: "Inspects general file tree, modules, and architecture of the project using MCP and AST.",
      parameters: {},
      execute: async (_params, context) => {
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.getArchitecture(rootDir);
          if (res) {
            return {
              success: true,
              output: res,
            };
          }
        }

        const map = await buildCodebaseMap(rootDir);
        const fileList: FileEntry[] = Object.values(map.files);
        return {
          success: true,
          output: `[Local Codebase Map] (${map.fileCount} files, ${map.totalLines} lines):\n` +
            fileList.slice(0, 30).map((f) => `- ${f.path} (${f.lines} lines)`).join("\n"),
        };
      },
    },
  ],
};

