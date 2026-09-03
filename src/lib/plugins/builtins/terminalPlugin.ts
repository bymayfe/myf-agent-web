// src/lib/plugins/builtins/terminalPlugin.ts
// Terminal ve Komut Çalıştırma Eklentisi (Güvenli, canlı yayınlanan komut çalıştırma)

import type { MyfPlugin } from "../types";
import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { registerTask, appendOutput, finishTask } from "./terminalRegistry";
import fs from "fs";
import path from "path";

// ── KOORDİNATÖRÜN KENDİ PORTU ───────────────────────────────────────────────
// Sabit "3111" yazmak yerine env'den okunuyor (kullanıcı Ayarlar/`.env`'den
// portu değiştirirse de doğru kalsın diye). `next dev -p 3111` ile başladığı
// için Next.js bu değeri `process.env.PORT`'a yazmaz, o yüzden ekstra olarak
// PORT env'i yoksa paket.json'daki "dev"/"start" script'inden de okumayı dene.
export function getCoordinatorPort(): string {
  if (process.env.PORT) return String(process.env.PORT);
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = `${pkg?.scripts?.dev ?? ""} ${pkg?.scripts?.start ?? ""}`;
    const m = /-p\s+(\d{2,5})|--port[= ](\d{2,5})/i.exec(scripts);
    if (m) return m[1] || m[2];
  } catch {
    // yoksay, aşağıdaki varsayılana düş
  }
  return "3111";
}

// Hedef proje dizininin (cwd) gerçek dev portunu tespit etmeye çalışır.
// Bilinemiyorsa "3000" (Next.js/çoğu framework'ün varsayılanı) döner.
function getProjectDevPort(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = `${pkg?.scripts?.dev ?? ""} ${pkg?.scripts?.start ?? ""}`;
    const m = /-p\s+(\d{2,5})|--port[= ](\d{2,5})/i.exec(scripts);
    if (m) return m[1] || m[2];
  } catch {
    // yoksay
  }
  return "3000";
}

// ── ÖNEMLİ ────────────────────────────────────────────────────────────────
// SORUN: `data.toString("utf-8")` her `data` olayında BAĞIMSIZ çağrılıyordu.
// child_process'in stdout/stderr'i rastgele byte sınırlarında parçalar halinde
// gelir; Türkçe karakterler (ç, ğ, ı, ö, ş, ü vb.) UTF-8'de çok baytlı
// kodlandığından, bir karakterin baytları iki ayrı `data` olayına bölündüğünde
// her parçayı tek başına `toString("utf-8")` ile çözmek geçersiz/kayıp
// karakterler üretir ("veri saçma sapan yerde kesiliyor" şikayetinin asıl
// kaynağı buydu — gerçek zamanlı bir terminalin ASLA yapmayacağı bir hataydı).
// ÇÖZÜM: Node'un `string_decoder` modülündeki durumlu (stateful) `StringDecoder`
// kullanılıyor; bölünmüş çok baytlı diziler bir sonraki `write` çağrısına kadar
// dahili tamponda bekletilip doğru şekilde birleştiriliyor.

export function runStreamingCommand(
  cmd: string,
  cwd: string,
  onChunk?: (chunk: string) => void,
  taskId?: string,
  sessionId?: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    // Çok tehlikeli komutları engelle
    if (cmd.includes("rm -rf /") || cmd.includes(":(){ :|:& };:")) {
      const err = "Güvenlik nedeniyle bu komut engellendi.";
      onChunk?.(err);
      return resolve({ success: false, output: err });
    }

    // ── ÖNEMLİ: KENDİ KENDİNİ ÖLDÜRME KORUMASI ─────────────────────────
    // GERÇEK OLAY: Model "npm run dev" ile 3000 portunda takılı kalan bir
    // sunucuyu kurtarmak için `pkill -f "next dev" || pkill -f "node"`
    // çalıştırdı. Bu komut ADI GEÇEN sürece özgü değil — makinedeki HER
    // "node" komut satırını hedef alır. Bu koordinatör uygulamasının
    // KENDİSİ de `next dev` üzerinden bir node süreci olarak çalıştığından,
    // komut kendi sunucusunu da öldürdü: SSE bağlantısı anında koptu ve
    // istemci tarafında "Error in input stream" hatası olarak göründü
    // (bkz. useCoordinatorChat.ts'teki reader.read() catch bloğu — bu
    // hatanın kaynağı orası, yamada değişiklik yapılmadı).
    // ÇÖZÜM: Kapsamsız/geniş process-kill komutlarını engelleyip modele
    // PORT'a özel (dolayısıyla kendi sürecini asla vurmayacak) güvenli bir
    // alternatif öner.
    const broadKillPattern = /\b(pkill|killall)\b[^\n]*\b(node|next|npm|bun|deno)\b/i;
    if (broadKillPattern.test(cmd)) {
      const suggestedPort = getProjectDevPort(cwd);
      const err =
        "Bu komut engellendi: 'pkill/killall ... node|next|npm' gibi kapsamsız komutlar makinedeki TÜM node süreçlerini (bu koordinatör uygulamasının kendi sunucusu dahil!) hedef alır ve kendi kendine kesintiye (\"Error in input stream\") yol açar. " +
        `Bunun yerine PORT'a özel sonlandırma kullan, örn: \`lsof -ti:${suggestedPort} | xargs -r kill -9\` (üzerinde çalıştığın projenin portu — yalnızca o portu dinleyen süreci öldürür, koordinatörün kendi sürecine dokunmaz).`;
      onChunk?.(err);
      return resolve({ success: false, output: err });
    }

    // ── PORT'A ÖZEL KOMUTLARDA KENDİ PORTUNU HEDEF ALMA KORUMASI ────────
    // GERÇEK OLAY: Kullanıcı bildirdi — port'a özel bir sonlandırma komutu
    // (yukarıdaki öneri PATTERN'i dahil) koordinatörün KENDİ portunu (3111)
    // hedef aldığında koordinatör kendi kendini kapatıp "kayboluyor". Model
    // bazen üzerinde çalıştığı projenin portunu değil, kendi çalıştığı
    // coordinator sürecinin portunu (örn. `lsof -i` çıktısında ilk gördüğü
    // portu) yanlışlıkla hedefliyor. ÇÖZÜM: komutun içinde koordinatörün
    // kendi portu, bir "öldürme/sonlandırma" fiiliyle birlikte geçiyorsa
    // komut tamamen engellenir ve modele üzerinde çalıştığı PROJENİN gerçek
    // portu (package.json'dan tespit edilir) açıkça söylenir.
    const coordinatorPort = getCoordinatorPort();
    const killVerbPattern = /\b(kill|pkill|killall|fuser|kill-port|npx\s+kill-port|terminate|stop)\b/i;
    const referencesCoordinatorPort = new RegExp(`(:|\\s)${coordinatorPort}\\b`).test(cmd);
    if (referencesCoordinatorPort && killVerbPattern.test(cmd)) {
      const projectPort = getProjectDevPort(cwd);
      const err =
        `Bu komut engellendi: Port ${coordinatorPort} bu koordinatör uygulamasının KENDİ portu — bu portu hedefleyen bir sonlandırma komutu koordinatörün kendisini kapatır ve sohbetin ortadan "kaybolmasına" yol açar. ` +
        `Üzerinde çalıştığın proje (${path.basename(cwd)}) muhtemelen farklı bir portta çalışıyor. Tespit edilen proje portu: ${projectPort} — komutu port ${projectPort} için tekrar dene, örn: \`lsof -ti:${projectPort} | xargs -r kill -9\`. ` +
        `Emin değilsen önce projenin \`package.json\` dosyasındaki "dev"/"start" script'ini oku, orada geçen portu kullan; koordinatörün kendi portuna asla dokunma.`;
      onChunk?.(err);
      return resolve({ success: false, output: err });
    }

    // Interaktif CLI araçlarını otomatik non-interactive (sessiz/otomatik evet) moduna dönüştür
    let processedCmd = cmd;
    if (processedCmd.includes("create-next-app") && !processedCmd.includes("--yes") && !processedCmd.includes("-y")) {
      processedCmd = processedCmd.replace("create-next-app", "create-next-app --yes --ts --tailwind --eslint --app --no-src-dir");
    }
    if (processedCmd.includes("npm init") && !processedCmd.includes("-y") && !processedCmd.includes("--yes")) {
      processedCmd = processedCmd.replace("npm init", "npm init -y");
    }

    const child = spawn(processedCmd, {
      shell: true,
      cwd,
      env: { ...process.env, CI: "1", DEBIAN_FRONTEND: "noninteractive", FORCE_COLOR: "1" },
    });

    if (taskId) {
      registerTask({ id: taskId, command: cmd, cwd, sessionId, child });
    }

    // İstek SSE bağlantısına güvenli enqueue: bağlantı kapanmışsa (F5, sekme
    // kapatma, stop butonu) burada patlamak yerine sessizce yutulur — böylece
    // komut arka planda çalışmaya ve registry'e yazmaya devam edebilir.
    const safeOnChunk = (text: string) => {
      try {
        onChunk?.(text);
      } catch {
        // bağlantı kapalı, sorun değil — çıktı registry'de zaten güvende
      }
    };

    let fullOutput = "";
    let isResolved = false;

    // Uzun süren dev sunucuları (npm run dev vb.) kasıtlı olarak süresiz
    // çalışabilmeli — bunları 120sn'de öldürmek yanlış. Yalnızca komutun
    // "biten" türden olduğunu varsaydığımız durumlarda zaman aşımı uygula;
    // arka planda kalması istenen sunucu komutlarını `&` veya bilinen dev
    // sunucusu desenleriyle tespit edip zaman aşımından muaf tut.
    const looksLikeLongRunningServer =
      /\bnpm\s+run\s+dev\b|\bnext\s+dev\b|\bvite\b|\bnodemon\b|\bollama\s+serve\b|&\s*$/.test(processedCmd);

    // Uzun süren sunucu komutları için: süreci kapanana kadar BEKLEMEK yerine
    // kısa bir "ısınma" süresinden sonra (hâlâ ayaktaysa) "arka planda
    // başlatıldı" diyerek hemen dön. Böylece ajan turu sonsuza kadar asılı
    // kalmaz; komut registry'de görev olarak yaşamaya ve çıktı üretmeye
    // devam eder, kullanıcı TerminalPanel'den canlı izleyebilir/sonlandırabilir.
    if (looksLikeLongRunningServer) {
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const msg = taskId
            ? `[Arka planda başlatıldı — görev ID: ${taskId}. Bu bir sunucu/izleyici komutu olduğu için tamamlanmasını beklemedim; çıktı Terminal panelinden canlı akmaya devam edecek. Durdurmak için panelden "Sonlandır" butonunu kullanın.]\n${fullOutput}`
            : fullOutput;
          resolve({ success: true, output: msg });
        }
      }, 2500);
    }

    const timeout = looksLikeLongRunningServer
      ? null
      : setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
            const timeoutMsg = "\n[Uyarı: Komut zaman aşımına uğradı (120s) ve sonlandırıldı.]";
            fullOutput += timeoutMsg;
            if (taskId) appendOutput(taskId, timeoutMsg);
            safeOnChunk(timeoutMsg);
            if (taskId) finishTask(taskId, "error", null);
            resolve({ success: false, output: fullOutput });
          }
        }, 120000);

    const stdoutDecoder = new StringDecoder("utf-8");
    const stderrDecoder = new StringDecoder("utf-8");

    const handleOutput = (data: Buffer, isStderr: boolean) => {
      // Her stream'in kendi StringDecoder'ını kullan: bölünmüş çok baytlı
      // UTF-8 dizileri decoder'ın iç tamponunda bekler ve bir sonraki
      // parçayla birleştirilene kadar çıktıya YAZILMAZ.
      const text = (isStderr ? stderrDecoder : stdoutDecoder).write(data);
      if (!text) return;
      fullOutput += text;
      if (taskId) appendOutput(taskId, text);
      safeOnChunk(text);

      // Eğer komut bir soru sorup beklemede kaldıysa (interaktif prompt), otomatik Enter gönder
      if (text.includes("? ") || text.includes("(y/N)") || text.includes("[Y/n]") || text.includes("Enter to submit")) {
        try {
          child.stdin?.write("\n");
        } catch {
          // ignore
        }
      }
    };

    child.stdout.on("data", (d: Buffer) => handleOutput(d, false));
    child.stderr.on("data", (d: Buffer) => handleOutput(d, true));

    child.on("close", (code) => {
      // Kapanışta decoder'ların içinde bekleyen (yarım kalmış) baytlar varsa
      // flush et — aksi halde çıktının son karakteri sessizce kaybolabilir.
      const tail = stdoutDecoder.end() + stderrDecoder.end();
      if (tail) {
        fullOutput += tail;
        if (taskId) appendOutput(taskId, tail);
        safeOnChunk(tail);
      }
      if (timeout) clearTimeout(timeout);
      if (taskId) finishTask(taskId, code === 0 ? "completed" : "error", code);
      if (!isResolved) {
        isResolved = true;
        resolve({
          success: code === 0,
          output: fullOutput || (code === 0 ? "(Başarıyla tamamlandı)" : `Hata (Çıkış kodu: ${code})`),
        });
      }
    });

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      if (taskId) finishTask(taskId, "error", null);
      if (!isResolved) {
        isResolved = true;
        const errMsg = `Komut başlatılamadı: ${err.message}`;
        fullOutput += errMsg;
        safeOnChunk(errMsg);
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
Testleri çalıştırmak, bağımlılıkları kontrol etmek veya shell komutları çalıştırmak için 'run_command' aracını kullanabilirsin.`;
  },

  tools: [
    {
      name: "run_command",
      displayName: "Komut Çalıştır",
      description: "Proje çalışma dizininde bir shell komutu çalıştırır.",
      parameters: {
        command: {
          type: "string",
          description: "Çalıştırılacak shell komutu (örn: 'npm test', 'ls -la', 'python script.py')",
          required: true,
        },
      },
      execute: async (params, context) => {
        const cmd = String(params.command || "").trim();
        if (!cmd) return { success: false, output: "Komut belirtilmedi." };
        const cwd = context.projectDir || process.cwd();
        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        return runStreamingCommand(cmd, cwd, undefined, taskId, context.sessionId);
      },
    },
  ],
};
