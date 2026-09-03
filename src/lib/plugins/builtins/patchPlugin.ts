// src/lib/plugins/builtins/patchPlugin.ts
// Cerrahi Yama ve Değiştirme Eklentisi (Surgical Search & Replace / Unified Diff)

import type { MyfPlugin } from "../types";
import { promises as fs } from "fs";
import path from "path";

export const patchPlugin: MyfPlugin = {
  id: "patch-engine",
  name: "Cerrahi Yama & Diff Motoru",
  version: "1.0.0",
  description: "Dosyaları baştan yazmak yerine sadece belirli satırları cerrahi olarak arar ve değiştirir.",
  category: "filesystem",
  icon: "FileCode",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Cerrahi Yama & Diff Motoru]
Büyük bir dosyada sadece birkaç satırı değiştirmek için dosyanın tamamını baştan yazmak yerine 'search_and_replace' aracını kullanabilirsin.`;
  },

  tools: [
    {
      name: "search_and_replace",
      displayName: "Ara ve Değiştir (Cerrahi Yama)",
      description: "Belirtilen dosya içinde hedef metin bloğunu arar ve yeni içerikle değiştirir.",
      parameters: {
        path: {
          type: "string",
          description: "Değiştirilecek dosya yolu (örn: 'src/app/page.tsx')",
          required: true,
        },
        search_block: {
          type: "string",
          description: "Dosyada aranacak ve değiştirilecek tam metin bloğu",
          required: true,
        },
        replace_block: {
          type: "string",
          description: "Hedef bloğun yerine yazılacak yeni metin bloğu",
          required: true,
        },
      },
      execute: async (params, context) => {
        const relPath = String(params.path || "").trim();
        const searchBlock = String(params.search_block || "");
        const replaceBlock = String(params.replace_block || "");

        if (!relPath) return { success: false, output: "Dosya yolu belirtilmedi." };
        if (!searchBlock) return { success: false, output: "Arama bloğu boş olamaz." };

        const rootDir = context.projectDir || process.cwd();
        const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(rootDir, relPath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          if (!content.includes(searchBlock)) {
            return {
              success: false,
              output: `Hedef arama bloğu dosyada (${relPath}) bulunamadı. Lütfen tam satırları kontrol edin.`,
            };
          }

          const updated = content.replace(searchBlock, replaceBlock);
          await fs.writeFile(fullPath, updated, "utf-8");

          return {
            success: true,
            output: `Dosya (${relPath}) başarıyla cerrahi olarak yamalandı ve güncellendi.`,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `Yama uygulanamadı: ${msg}` };
        }
      },
    },
  ],
};
