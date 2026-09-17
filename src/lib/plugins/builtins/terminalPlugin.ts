// src/lib/plugins/builtins/terminalPlugin.ts
// Terminal ve Komut Çalıştırma Eklentisi (Güvenli, canlı yayınlanan komut çalıştırma)

import type { MyfPlugin } from "../types";
import { spawn } from "child_process";

export function runStreamingCommand(
  cmd: string,
  cwd: string,
  onChunk?: (chunk: string) => void
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    // Çok tehlikeli komutları engelle
    if (cmd.includes("rm -rf /") || cmd.includes(":(){ :|:& };:")) {
      const err = "Güvenlik nedeniyle bu komut engellendi.";
      onChunk?.(err);
      return resolve({ success: false, output: err });
    }

    // Interaktif CLI araçlarını otomatik non-interactive (sessiz/otomatik evet) moduna dönüştür
    let processedCmd = cmd;
    if (processedCmd.startsWith("npx ") && !processedCmd.startsWith("npx -y ") && !processedCmd.startsWith("npx --yes ")) {
      processedCmd = processedCmd.replace(/^npx\s+/, "npx -y ");
    }
    if (processedCmd.includes("create-next-app") && !processedCmd.includes("--yes")) {
      processedCmd += " --yes";
    }
    if (processedCmd.includes("npm init") && !processedCmd.includes("-y") && !processedCmd.includes("--yes")) {
      processedCmd += " -y";
    }

    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      CI: "1",
      DEBIAN_FRONTEND: "noninteractive",
      FORCE_COLOR: "1",
    };
    delete childEnv.PORT; // Host Web UI portunun (3111) alt projeye sızmasını engelle

    const child = spawn(processedCmd, [], {
      shell: true,
      cwd,
      env: childEnv as NodeJS.ProcessEnv,
    });

    let fullOutput = "";
    let isResolved = false;

    // 120 saniyelik güvenlik zaman aşımı (asılı kalmayı önler)
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        const timeoutMsg = "\n[Uyarı: Komut zaman aşımına uğradı (120s) ve sonlandırıldı.]";
        fullOutput += timeoutMsg;
        onChunk?.(timeoutMsg);
        resolve({ success: false, output: fullOutput });
      }
    }, 120000);

    const handleOutput = (data: Buffer) => {
      const text = data.toString("utf-8");
      fullOutput += text;
      onChunk?.(text);

      // Eğer komut bir soru sorup beklemede kaldıysa (interaktif prompt), otomatik Enter gönder
      if (text.includes("? ") || text.includes("(y/N)") || text.includes("[Y/n]") || text.includes("Enter to submit")) {
        try {
          child.stdin?.write("\n");
        } catch {
          // ignore
        }
      }

      // Dev server'lar (npm run dev, next dev vb.) hazır olduğunda kilitlenmeyi önle
      const isDevServer = /\b(npm\s+run\s+dev|next\s+dev|npm\s+start|npx\s+nodemon|yarn\s+dev|pnpm\s+dev)\b/.test(processedCmd);
      if (isDevServer && (fullOutput.includes("Ready in") || fullOutput.includes("Local:") || fullOutput.includes("http://localhost"))) {
        setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            try {
              child.kill();
            } catch {
              // ignore
            }
            const readyMsg = "\n[Geliştirme sunucusu başarıyla derlendi ve ayağa kalktığı doğrulandı. Portun kilitli kalmaması için test süreci tamamlandı. Projeyi sürekli çalıştırmak için terminalden komutu doğrudan verebilirsiniz.]";
            fullOutput += readyMsg;
            onChunk?.(readyMsg);
            resolve({ success: true, output: fullOutput });
          }
        }, 3000);
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (!isResolved) {
        isResolved = true;
        resolve({
          success: code === 0,
          output: fullOutput || (code === 0 ? "(Başarıyla tamamlandı)" : `Hata (Çıkış kodu: ${code})`),
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (!isResolved) {
        isResolved = true;
        const errMsg = `Komut başlatılamadı: ${err.message}`;
        fullOutput += errMsg;
        onChunk?.(errMsg);
        resolve({
          success: false,
          output: errMsg,
        });
      }
    });
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
