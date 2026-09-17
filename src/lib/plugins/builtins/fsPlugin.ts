// src/lib/plugins/builtins/fsPlugin.ts
// Dosya Sistemi Operasyonları Eklentisi (Read, Write, List, Find)

import type { MyfPlugin } from "../types";
import { promises as fs } from "fs";
import path from "path";

export const fsPlugin: MyfPlugin = {
  id: "fs-ops",
  name: "Dosya Sistemi (FS Tools)",
  version: "1.0.0",
  description: "Proje dizinindeki dosyaları güvenli bir şekilde okur, yazar ve listeler.",
  category: "filesystem",
  icon: "Files",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Dosya Sistemi (FS Tools)]
Projedeki dosyaları okumak için 'read_file', yeni dosya kaydetmek/düzenlemek için 'write_file', klasör listelemek için 'list_directory' araçlarını kullanabilirsin.`;
  },

  tools: [
    {
      name: "read_file",
      displayName: "Dosya Oku",
      description: "Belirtilen dosyanın içeriğini okur.",
      parameters: {
        filePath: {
          type: "string",
          description: "Okunacak dosyanın proje dizinine göre göreceli veya mutlak yolu",
          required: true,
        },
      },
      execute: async (params, context) => {
        const rawPath = String(params.filePath || params.path || params.file || "").trim();
        if (!rawPath) return { success: false, output: "Dosya yolu belirtilmeli." };

        const target = path.isAbsolute(rawPath) ? rawPath : path.join(context.projectDir, rawPath);
        try {
          const content = await fs.readFile(target, "utf-8");
          const lines = content.split("\n");
          if (lines.length > 800) {
            return {
              success: true,
              output: `📄 Dosya: ${rawPath} (${lines.length} satır - ilk 800 satır gösteriliyor):\n\n` + lines.slice(0, 800).join("\n"),
            };
          }
          return {
            success: true,
            output: `📄 Dosya: ${rawPath} (${lines.length} satır):\n\n${content}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Dosya okunamadı: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
    {
      name: "write_file",
      displayName: "Dosya Yaz / Güncelle",
      description: "Belirtilen dosyayı oluşturur veya günceller.",
      parameters: {
        filePath: {
          type: "string",
          description: "Yazılacak dosyanın yolu",
          required: true,
        },
        content: {
          type: "string",
          description: "Dosyaya yazılacak tam kod veya metin içeriği",
          required: true,
        },
      },
      execute: async (params, context) => {
        const rawPath = String(params.filePath || params.path || params.file || "").trim();
        const content = String(params.content ?? "");
        if (!rawPath) return { success: false, output: "Dosya yolu belirtilmeli." };

        const target = path.isAbsolute(rawPath) ? rawPath : path.join(context.projectDir, rawPath);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, content, "utf-8");
          const lines = content.split("\n").length;
          return {
            success: true,
            output: `✅ Dosya başarıyla kaydedildi: ${rawPath} (${lines} satır)`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Dosya yazılamadı: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
    {
      name: "list_directory",
      displayName: "Dizin Listele",
      description: "Belirtilen klasörün içindeki dosya ve alt klasörleri listeler.",
      parameters: {
        dirPath: {
          type: "string",
          description: "Listelenecek klasör yolu (varsayılan: proje kök dizini)",
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
            output: `📂 Dizin: ${rawPath || "."}\n` + (items.join("\n") || "(Boş dizin)"),
          };
        } catch (err) {
          return {
            success: false,
            output: `Dizin listelenemedi: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
  ],
};
