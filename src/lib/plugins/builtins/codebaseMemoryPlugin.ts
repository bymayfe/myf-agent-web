// src/lib/plugins/builtins/codebaseMemoryPlugin.ts
// DeusData/codebase-memory-mcp tabanlı Bilgi Grafiği ve Sembol Arama Eklentisi.

import type { MyfPlugin } from "../types";
import { codebaseMemoryClient } from "@/lib/codebaseMemoryClient";
import { buildCodebaseMap } from "@/lib/codebaseMap";
import type { FileEntry } from "@/lib/codebaseMap";

export const codebaseMemoryPlugin: MyfPlugin = {
  id: "codebase-memory",
  name: "Codebase Memory (MCP Bilgi Grafiği)",
  version: "1.0.0",
  description: "Proje mimarisini, sembol grafiğini, çağrı yollarını ve fonksiyon bağlantılarını MCP grafiği üzerinden sorgular.",
  category: "codebase",
  icon: "Brain",
  enabled: true,
  author: "MYF Agent Core & DeusData",

  systemPromptContribution: () => {
    return `[EKLENTİ: Codebase Memory (MCP Bilgi Grafiği)]
Proje mimarisini, sembolleri, fonksiyon çağrı zincirlerini (kim kimi çağırıyor) sorgulamak için 'search_graph', 'trace_path', 'get_architecture' ve 'get_code_snippet' araçlarını kullanabilirsin.`;
  },

  tools: [
    {
      name: "search_graph",
      displayName: "Grafikte Sembol/Fonksiyon Ara",
      description: "Codebase Memory bilgi grafiğinde fonksiyon, sınıf, route veya değişkenleri arar.",
      parameters: {
        query: {
          type: "string",
          description: "Aranacak sembol adı veya regex (örn: 'OrderHandler', 'useCoordinatorChat')",
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
              output: `[Codebase Memory MCP Sonuçları]:\n${mcpResult}`,
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
          return { success: true, output: `"${query}" ile eşleşen bir sembol bulunamadı.` };
        }

        return {
          success: true,
          output: `[Yerel AST Sembol Arama]: "${query}" (${matched.length} dosya):\n` +
            matched.map((f) => `- ${f.path} (${f.symbols.join(", ") || "sembol yok"})`).join("\n"),
        };
      },
    },
    {
      name: "trace_path",
      displayName: "Çağrı Zincirini İzle (Trace Path)",
      description: "Bir fonksiyonu kimin çağırdığını (inbound) veya o fonksiyonun neleri çağırdığını (outbound) bilgi grafiğinde izler.",
      parameters: {
        symbol: {
          type: "string",
          description: "İzlenecek fonksiyon veya sınıf adı",
          required: true,
        },
        direction: {
          type: "string",
          description: "Yön: 'inbound' (kim çağırıyor), 'outbound' (kimi çağırıyor) veya 'both'",
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
              output: `[MCP Çağrı Grafiği (${symbol} - ${dir})]:\n${res}`,
            };
          }
        }

        return {
          success: true,
          output: `"${symbol}" için çağrı zinciri çıkarılamadı (MCP grafiği henüz indekslenmemiş olabilir).`,
        };
      },
    },
    {
      name: "get_code_snippet",
      displayName: "Sembol Kod Parçasını Oku",
      description: "Belirtilen nitelikli sembolün (qualified_name) tam gövdesini ve kaynak kodunu döner.",
      parameters: {
        qualified_name: {
          type: "string",
          description: "Sembolün tam adı (örn: 'src/app/page.Home' veya 'lib/store.getSettings')",
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
          output: `"${qName}" sembolünün kaynak kodu MCP üzerinden okunamadı.`,
        };
      },
    },
    {
      name: "get_architecture",
      displayName: "Proje Mimari Grafiği",
      description: "Projenin tüm mimari yapısını, giriş noktalarını ve ana bileşenlerini bilgi grafiğinden döner.",
      parameters: {},
      execute: async (_params, context) => {
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.getArchitecture(rootDir);
          if (res) {
            return {
              success: true,
              output: `[Codebase Memory MCP Mimari Grafiği]:\n${res}`,
            };
          }
        }

        const map = await buildCodebaseMap(rootDir);
        const fileList: FileEntry[] = Object.values(map.files);
        return {
          success: true,
          output: `[Yerel AST Mimari Özeti] (${map.fileCount} dosya, ${map.totalLines} satır):\n` +
            fileList.slice(0, 30).map((f) => `- ${f.path} (${f.lines} satır)`).join("\n"),
        };
      },
    },
    {
      name: "get_codebase_summary",
      displayName: "Proje Kod Haritası ve Özeti",
      description: "Projenin genel dosya ağacını, modüllerini ve mimarisini MCP ve AST ile inceler.",
      parameters: {},
      execute: async (_params, context) => {
        const rootDir = context.projectDir || process.cwd();

        if (await codebaseMemoryClient.isAvailable()) {
          await codebaseMemoryClient.indexRepository(rootDir);
          const res = await codebaseMemoryClient.getArchitecture(rootDir);
          if (res) {
            return {
              success: true,
              output: `[Codebase Memory MCP Mimarisi]:\n${res}`,
            };
          }
        }

        const map = await buildCodebaseMap(rootDir);
        const fileList: FileEntry[] = Object.values(map.files);
        return {
          success: true,
          output: `[Yerel Kod Haritası] (${map.fileCount} dosya, ${map.totalLines} satır):\n` +
            fileList.slice(0, 30).map((f) => `- ${f.path} (${f.lines} satır)`).join("\n"),
        };
      },
    },
  ],
};

