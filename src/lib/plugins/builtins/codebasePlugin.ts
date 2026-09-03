// src/lib/plugins/builtins/codebasePlugin.ts
// Codebase Map & Sembol Arama Eklentisi

import type { MyfPlugin } from "../types";
import { buildCodebaseMap, formatMapForLLM, searchMap } from "@/lib/codebaseMap";

export const codebasePlugin: MyfPlugin = {
  id: "codebase-intel",
  name: "Codebase Memory & Map",
  version: "1.0.0",
  description: "Proje kod haritasını tarar, fonksiyon, sınıf ve interface sembollerini token harcamadan bulur.",
  category: "codebase",
  icon: "Cpu",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Codebase Memory & Map]
Projedeki dosya ve sembolleri hızlıca taramak için 'search_symbols' ve 'get_codebase_summary' araçlarını kullanabilirsin.`;
  },

  tools: [
    {
      name: "search_symbols",
      displayName: "Sembol Ara (Fonksiyon/Sınıf)",
      description: "Proje genelinde fonksiyon, sınıf, tip veya dosya adına göre arama yapar.",
      parameters: {
        query: {
          type: "string",
          description: "Aranacak sembol adı veya kelime (örn: 'Coordinator', 'useChat', 'buildPrompt')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const query = String(params.query || "").trim();
        if (!query) return { success: false, output: "Arama terimi giriniz." };

        try {
          const map = await buildCodebaseMap(context.projectDir);
          const results = searchMap(map, query);

          if (results.length === 0) {
            return {
              success: true,
              output: `"${query}" ile eşleşen sembol veya dosya bulunamadı (${map.fileCount} dosya tarandı).`,
            };
          }

          const lines = [`🔎 "${query}" ile eşleşen ${results.length} dosya/sembol:\n`];
          results.slice(0, 15).forEach((r) => {
            const syms = r.symbols.length > 0 ? ` → Semboller: [${r.symbols.slice(0, 8).join(", ")}]` : "";
            lines.push(`📄 ${r.path} (${r.lines} satır, ${r.lang})${syms}`);
          });

          return {
            success: true,
            output: lines.join("\n"),
            data: results,
          };
        } catch (err) {
          return {
            success: false,
            output: `Sembol arama hatası: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
    {
      name: "get_codebase_summary",
      displayName: "Proje Kod Özeti",
      description: "Tüm projenin kompakt dosya ve sembol haritasını döndürür.",
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
            output: `Kod haritası çıkarılamadı: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
  ],
};
