// src/lib/plugins/customLoader.ts
// data/plugins/ klasöründen özel kullanıcı eklentilerini dinamik olarak yükler.
//
// Her eklenti data/plugins/<plugin-id>/plugin.json şeklinde tanımlanabilir:
// {
//   "id": "my-custom-tool",
//   "name": "Benim Özel Eklentim",
//   "version": "1.0.0",
//   "description": "Özel webhook veya komut aracı",
//   "category": "custom",
//   "icon": "Puzzle",
//   "enabled": true,
//   "tools": [
//     {
//       "name": "custom_ping",
//       "displayName": "Ping Testi",
//       "description": "Bir servise ping atar",
//       "command": "curl -s https://api.ipify.org"
//     }
//   ]
// }

import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { MyfPlugin, ToolDefinition } from "./types";

const execAsync = promisify(exec);
const CUSTOM_PLUGINS_DIR = path.join(process.cwd(), "data", "plugins");

export async function ensureCustomPluginsDir(): Promise<string> {
  await fs.mkdir(CUSTOM_PLUGINS_DIR, { recursive: true });

  // Örnek bir eklenti şablonu oluştur (eğer klasör boşsa)
  const readmePath = path.join(CUSTOM_PLUGINS_DIR, "README.md");
  const exists = await fs.stat(readmePath).catch(() => null);
  if (!exists) {
    const readmeContent = `# MYF Agent Özel Eklentiler Klasörü

Buraya kendi özel eklentilerinizi klasör olarak ekleyebilirsiniz.

Örnek eklenti yapısı:
\`\`\`
data/plugins/
  ├── ornek-arac/
  │    └── plugin.json
\`\`\`

### plugin.json Örneği:
\`\`\`json
{
  "id": "ornek-arac",
  "name": "Örnek Sistem İzleyici",
  "version": "1.0.0",
  "description": "Sistem bellek ve CPU durumunu kontrol eder.",
  "category": "custom",
  "icon": "Cpu",
  "enabled": true,
  "tools": [
    {
      "name": "check_memory",
      "displayName": "Bellek Durumu",
      "description": "Sistem RAM kullanımını gösterir.",
      "command": "free -h"
    }
  ]
}
\`\`\`
`;
    await fs.writeFile(readmePath, readmeContent, "utf-8");
  }

  return CUSTOM_PLUGINS_DIR;
}

export async function loadCustomPlugins(): Promise<MyfPlugin[]> {
  const dir = await ensureCustomPluginsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const customPlugins: MyfPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginJsonPath = path.join(dir, entry.name, "plugin.json");
    try {
      const raw = await fs.readFile(pluginJsonPath, "utf-8");
      const manifest = JSON.parse(raw);

      if (!manifest.id || !manifest.name) continue;

      const tools: ToolDefinition[] = (manifest.tools || []).map((t: {
        name: string;
        displayName?: string;
        description?: string;
        command?: string;
        script?: string;
      }) => ({
        name: t.name,
        displayName: t.displayName || t.name,
        description: t.description || "Özel kullanıcı aracı",
        parameters: {
          args: {
            type: "string",
            description: "Komuta geçirilecek argümanlar (opsiyonel)",
          },
        },
        execute: async (params: Record<string, unknown>, context: import("./types").PluginContext) => {
          if (!t.command) {
            return { success: false, output: "Çalıştırılacak komut tanımlanmamış." };
          }
          const userArgs = params.args ? ` ${String(params.args)}` : "";
          const cmd = `${t.command}${userArgs}`;
          const cwd = context.projectDir || process.cwd();
          try {
            const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 20000 });
            return {
              success: true,
              output: (stdout + (stderr ? `\n[STDERR]: ${stderr}` : "")).trim() || "(Başarıyla tamamlandı)",
            };
          } catch (err: unknown) {
            const error = err as { stdout?: string; stderr?: string; message?: string };
            return {
              success: false,
              output: `Komut hatası: ${error.stderr || error.message || "Hata"}`,
            };
          }
        },
      }));

      customPlugins.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version || "1.0.0",
        description: manifest.description || "Özel eklenti",
        category: "custom",
        icon: manifest.icon || "Puzzle",
        enabled: manifest.enabled ?? true,
        author: manifest.author || "Kullanıcı",
        tools,
      });
    } catch {
      // JSON ayrıştırma hatası — atla
    }
  }

  return customPlugins;
}
