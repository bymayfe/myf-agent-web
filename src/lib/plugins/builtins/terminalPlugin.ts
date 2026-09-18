// src/lib/plugins/builtins/terminalPlugin.ts
// Terminal ve Komut Çalıştırma Eklentisi (Güvenli, canlı yayınlanan komut çalıştırma)

import type { MyfPlugin } from "../types";
import { terminalManager } from "@/lib/terminalManager";

export function runStreamingCommand(
  cmd: string,
  cwd: string,
  onChunk?: (chunk: string) => void,
  customId?: string
): Promise<{ success: boolean; output: string }> {
  return terminalManager.runCommand({
    id: customId,
    cmd,
    cwd,
    onChunk,
    autoKillDevServerOnReady: true,
  });
}


export const terminalPlugin: MyfPlugin = {
  id: "terminal-ops",
  name: "Terminal & Shell Runner",
  version: "1.0.0",
  description: "Proje dizininde test, derleme ve bash komutları çalıştırır.",
  category: "terminal",
  icon: "Terminal",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Terminal & Shell Runner]
Testleri çalıştırmak, derleme yapmak veya shell komutları çalıştırmak için 'run_command' aracını kullanabilirsin.
ÖNEMLİ KURAL: 'next dev' veya 'npm run dev' gibi geliştirme sunucularını test etmek istediğinde komutun önüne 'timeout' koymana GEREK YOKTUR. Sistem sunucunun ayağa kalktığını otomatik algılar, çıktıyı doğrular ve portu kilitlememek için testi güvenle tamamlar.`;
  },

  tools: [
    {
      name: "run_command",
      displayName: "Komut Çalıştır",
      description: "Proje çalışma dizininde bir shell komutu çalıştırır (örn: 'npm run build', 'npm test', 'npm run dev', 'ls -la', 'python main.py'). Dev sunucularında timeout gerekmez.",
      parameters: {
        command: {
          type: "string",
          description: "Çalıştırılacak shell komutu (örn: 'npm run build', 'npm test', 'npm run dev', 'python script.py')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const cmd = String(params.command || "").trim();
        if (!cmd) return { success: false, output: "Komut belirtilmedi." };
        const cwd = context.projectDir || process.cwd();
        return runStreamingCommand(cmd, cwd);
      },
    },
  ],
};
