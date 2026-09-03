// src/lib/plugins/builtins/gitPlugin.ts
// Git Versiyon Kontrol Eklentisi (Status, Diff, Log, Branch takibi)

import type { MyfPlugin } from "../types";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const gitPlugin: MyfPlugin = {
  id: "git-ops",
  name: "Git Versiyon Kontrolü",
  version: "1.0.0",
  description: "Projenin Git durumunu, son commit'leri ve dosya değişikliklerini (diff) inceler.",
  category: "devops",
  icon: "GitBranch",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Git Versiyon Kontrolü]
Aktif projedeki git durumunu, değiştirilen dosyaları veya geçmiş commit'leri görmek için 'git_status', 'git_diff' ve 'git_log' araçlarını kullanabilirsin.`;
  },

  tools: [
    {
      name: "git_status",
      displayName: "Git Durumu",
      description: "Aktif projedeki git branch durumunu ve değiştirilmiş / staged dosyaları listeler.",
      parameters: {},
      execute: async (_params, context) => {
        const cwd = context.projectDir || process.cwd();
        try {
          const { stdout } = await execAsync("git status --short --branch", { cwd, timeout: 10000 });
          return {
            success: true,
            output: stdout.trim() || "Git çalışma dizini temiz, kaydedilmemiş değişiklik yok.",
          };
        } catch {
          return {
            success: true,
            output: "Bu proje dizininde henüz Git başlatılmamış (Git deposu değil). Proje yapısını ve durumunu incelemek için 'get_codebase_summary', 'search_symbols' veya 'list_directory' araçlarını kullanabilirsin.",
          };
        }
      },
    },
    {
      name: "git_diff",
      displayName: "Git Değişiklikleri (Diff)",
      description: "Projedeki kaydedilmemiş veya staged kod değişikliklerini (git diff) gösterir.",
      parameters: {
        staged: {
          type: "boolean",
          description: "Sadece staged (commit edilecek) değişiklikleri göster",
          default: false,
        },
        filePath: {
          type: "string",
          description: "Belirli bir dosyanın diff'ini görmek için dosya yolu",
        },
      },
      execute: async (params, context) => {
        const cwd = context.projectDir || process.cwd();
        const stagedFlag = params.staged ? "--staged" : "";
        const file = params.filePath ? `"${params.filePath}"` : "";
        try {
          const { stdout } = await execAsync(`git diff ${stagedFlag} ${file}`, { cwd, timeout: 15000 });
          const diff = stdout.trim();
          if (!diff) {
            return { success: true, output: "Herhangi bir diff bulunamadı." };
          }
          // Diff çok büyükse kısalt
          const truncated = diff.length > 5000 ? diff.slice(0, 5000) + "\n... (çıktı kısaltıldı)" : diff;
          return {
            success: true,
            output: truncated,
          };
        } catch (err) {
          return {
            success: false,
            output: `Diff alınamadı: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
    {
      name: "git_log",
      displayName: "Git Commit Geçmişi",
      description: "Projedeki son commit geçmişini gösterir.",
      parameters: {
        limit: {
          type: "number",
          description: "Gösterilecek commit sayısı (varsayılan: 5)",
          default: 5,
        },
      },
      execute: async (params, context) => {
        const cwd = context.projectDir || process.cwd();
        const limit = typeof params.limit === "number" ? Math.min(params.limit, 20) : 5;
        try {
          const { stdout } = await execAsync(`git log -n ${limit} --oneline --decorate`, { cwd, timeout: 10000 });
          return {
            success: true,
            output: stdout.trim() || "Henüz commit geçmişi yok.",
          };
        } catch (err) {
          return {
            success: false,
            output: `Commit geçmişi alınamadı: ${err instanceof Error ? err.message : "Hata"}`,
          };
        }
      },
    },
  ],
};
