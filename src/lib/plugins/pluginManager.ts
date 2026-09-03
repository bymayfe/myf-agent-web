// src/lib/plugins/pluginManager.ts
// Merkezi Eklenti ve Araç (Tool) Yönetim Motoru.
// DeepSeek Harness ve modern AI Agent mimarisine uygun olarak araçları ve hook'ları yönetir.

import type { MyfPlugin, ToolDefinition, ToolExecutionResult, PluginContext, PluginManifest } from "./types";
import { webPlugin } from "./builtins/webPlugin";
import { gitPlugin } from "./builtins/gitPlugin";
import { fsPlugin } from "./builtins/fsPlugin";
import { codebasePlugin } from "./builtins/codebasePlugin";
import { terminalPlugin } from "./builtins/terminalPlugin";
import { patchPlugin } from "./builtins/patchPlugin";
import { testRunnerPlugin } from "./builtins/testRunnerPlugin";
import { codebaseMemoryPlugin } from "./builtins/codebaseMemoryPlugin";
import { getPluginsConfig, savePluginState } from "./store";
import { loadCustomPlugins, ensureCustomPluginsDir } from "./customLoader";

// Varsayılan kayıtlı tüm eklentiler
const BUILTIN_PLUGINS: MyfPlugin[] = [
  webPlugin,
  codebasePlugin,
  fsPlugin,
  gitPlugin,
  terminalPlugin,
  patchPlugin,
  testRunnerPlugin,
  codebaseMemoryPlugin,
];

class PluginManager {
  private plugins: Map<string, MyfPlugin> = new Map();

  constructor() {
    this.resetBuiltins();
  }

  private resetBuiltins() {
    this.plugins.clear();
    for (const p of BUILTIN_PLUGINS) {
      this.plugins.set(p.id, { ...p });
    }
  }

  /** Kayıtlı tüm yerleşik ve özel eklentileri yükler */
  async init(): Promise<void> {
    this.resetBuiltins();

    // Özel kullanıcı eklentilerini tara ve ekle
    try {
      const custom = await loadCustomPlugins();
      for (const cp of custom) {
        this.plugins.set(cp.id, cp);
      }
    } catch {
      // ignore
    }

    const config = await getPluginsConfig();
    for (const [id, plugin] of this.plugins.entries()) {
      if (config.plugins[id] !== undefined) {
        plugin.enabled = config.plugins[id].enabled;
      }
    }
  }

  /** Eklenti klasörünün mutlak yolunu döner */
  async getCustomPluginsDir(): Promise<string> {
    return ensureCustomPluginsDir();
  }

  /** Tüm eklenti manifestolarını döner (UI için) */
  async listPluginManifests(): Promise<PluginManifest[]> {
    await this.init();
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      category: p.category,
      icon: p.icon,
      enabled: p.enabled,
      author: p.author,
      toolNames: p.tools.map((t) => ({
        name: t.name,
        displayName: t.displayName,
        description: t.description,
      })),
    }));
  }

  /** Eklentiyi aç/kapat */
  async togglePlugin(id: string, enabled: boolean): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.enabled = enabled;
    await savePluginState(id, enabled);
    return true;
  }

  /** Sadece aktif olan eklentileri döner */
  async getActivePlugins(): Promise<MyfPlugin[]> {
    await this.init();
    return Array.from(this.plugins.values()).filter((p) => p.enabled);
  }

  /** Aktif olan tüm araçları (tools) map olarak döner */
  async getActiveTools(): Promise<Map<string, { tool: ToolDefinition; plugin: MyfPlugin }>> {
    const activePlugins = await this.getActivePlugins();
    const toolMap = new Map<string, { tool: ToolDefinition; plugin: MyfPlugin }>();
    for (const plugin of activePlugins) {
      for (const tool of plugin.tools) {
        toolMap.set(tool.name, { tool, plugin });
      }
    }
    return toolMap;
  }

  /** LLM Sistem Promptuna araç ve eklenti açıklamalarını enjekte eder */
  async buildPluginSystemPrompt(context: PluginContext): Promise<string> {
    const activePlugins = await this.getActivePlugins();
    if (activePlugins.length === 0) return "";

    const lines: string[] = [
      "=== AKTİF EKLENTİLER VE ARAÇLAR (TOOL USE) ===",
      "ÖNEMLİ VE KESİN KURALLAR:",
      "1. Sen komutları, aramaları ve dosya işlemlerini DOĞRUDAN KENDİSİ YÜRÜTEN otonom bir AI ajansın.",
      "2. ASLA kullanıcıya 'Lütfen şu komutu çalıştırın' veya 'Aşağıdaki komutu girin' deme! İşlemi SEN ```tool_call``` formatında çağıracaksın.",
      "3. Asla metin olarak sahte 'Parametreler' veya 'query:' yazma! SADECE geçerli JSON ```tool_call``` bloğu üret.",
      "",
      "ÖRNEK ARAÇ ÇAĞRILARI:",
      "Kullanıcı: 'İnternetten en güncel Next.js sürümünü araştırır mısın?'",
      "Asistan:",
      "```tool_call",
      '{"tool": "web_search", "parameters": {"query": "Next.js latest release npm version"}}',
      "```",
      "",
      "Kullanıcı: 'Proje durumunu ve dosyaları incele'",
      "Asistan:",
      "```tool_call",
      '{"tool": "get_codebase_summary", "parameters": {}}',
      "```",
      "",
      "MEVCUT ARAÇLAR:",
    ];


    for (const plugin of activePlugins) {
      lines.push(`\n[Eklenti: ${plugin.name}]`);
      if (plugin.systemPromptContribution) {
        lines.push(plugin.systemPromptContribution(context));
      }
      for (const tool of plugin.tools) {
        const paramKeys = Object.keys(tool.parameters);
        const paramsDesc = paramKeys.length > 0
          ? paramKeys.map((k) => `"${k}": <${tool.parameters[k].type}${tool.parameters[k].required ? ", zorunlu" : ""}> (${tool.parameters[k].description})`).join(", ")
          : "";
        lines.push(`  - Araç: \`${tool.name}\` — ${tool.description}\n    Örnek Parametreler: { ${paramsDesc || "(parametre yok)"} }`);
      }
    }

    lines.push("\nBir araç çalıştırdığında sonucu sistem sana iletecek. Sonuçları inceledikten sonra gerekiyorsa sıradaki adımı çalıştır veya kullanıcıya doğrudan nihai Türkçe yanıtını ver.");
    return lines.join("\n");
  }

  /** Bir aracı çalıştırır (güvenlik, hook'lar ve hata yönetimiyle) */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: PluginContext
  ): Promise<ToolExecutionResult> {
    const toolMap = await this.getActiveTools();
    const entry = toolMap.get(toolName);

    if (!entry) {
      return {
        success: false,
        output: `Araç bulunamadı veya eklentisi pasif durumda: '${toolName}'`,
        error: "TOOL_NOT_FOUND",
      };
    }

    const { tool, plugin } = entry;

    // 1. Hook: beforeToolExecute
    if (plugin.hooks?.beforeToolExecute) {
      const allowed = await plugin.hooks.beforeToolExecute(toolName, params, context);
      if (!allowed) {
        return {
          success: false,
          output: `Araç çalıştırma izni reddedildi: ${toolName}`,
          error: "PERMISSION_DENIED",
        };
      }
    }

    // 2. Execute tool
    try {
      const result = await tool.execute(params, context);

      // 3. Hook: afterToolExecute
      if (plugin.hooks?.afterToolExecute) {
        await plugin.hooks.afterToolExecute(toolName, result, context);
      }

      return result;
    } catch (err) {
      return {
        success: false,
        output: `Araç çalışırken hata oluştu: ${err instanceof Error ? err.message : "Hata"}`,
        error: "EXECUTION_ERROR",
      };
    }
  }

  /** Yanıttaki ```tool_call ... ``` veya ```json ... ``` veya çıplak JSON araç çağrı bloklarını ayrıştırır */
  extractToolCalls(text: string): Array<{ tool: string; parameters: Record<string, unknown> }> {
    if (!text) return [];
    const calls: Array<{ tool: string; parameters: Record<string, unknown> }> = [];
    const seen = new Set<string>();

    const repairAndParseJson = (raw: string): any => {
      const trimmed = raw.trim();
      try {
        return JSON.parse(trimmed);
      } catch {
        // 1. Düzeltme: Sondaki \"} veya \" } kaçış hatasını gider (Model string'i bitirirken backslash koyabilir)
        let s = trimmed.replace(/\\"\}\s*$/, "\"}").replace(/\\"\s*\}\s*$/, "\"}");
        s = s.replace(/,\s*([\}\]])/g, "$1");
        if (s.startsWith("{") && !s.endsWith("}")) {
          s = s + "}";
        }
        try {
          return JSON.parse(s);
        } catch {}

        // 2. Regex ile esnek kurtarma (özellikle write_file, run_command, web_search için)
        const toolMatch = /"(?:tool|function|name)"\s*:\s*"([^"]+)"/.exec(trimmed);
        if (toolMatch) {
          const toolName = toolMatch[1];
          const params: Record<string, unknown> = {};

          const pathMatch = /"(?:path|filePath)"\s*:\s*"([^"]+)"/.exec(trimmed);
          if (pathMatch) params.path = pathMatch[1];

          const cmdMatch = /"command"\s*:\s*"([^"]+)"/.exec(trimmed);
          if (cmdMatch) params.command = cmdMatch[1];

          const queryMatch = /"query"\s*:\s*"([^"]+)"/.exec(trimmed);
          if (queryMatch) params.query = queryMatch[1];

          const contentIdx = trimmed.indexOf('"content":');
          if (contentIdx !== -1) {
            let contentRaw = trimmed.slice(contentIdx + 10).trim();
            if (contentRaw.startsWith('"')) contentRaw = contentRaw.slice(1);
            contentRaw = contentRaw
              .replace(/\\"\s*\}\s*$/, "")
              .replace(/"\s*\}\s*$/, "")
              .replace(/\}\s*$/, "");
            try {
              contentRaw = JSON.parse(`"${contentRaw.replace(/"/g, '\\"')}"`);
            } catch {
              contentRaw = contentRaw
                .replace(/\\n/g, "\n")
                .replace(/\\t/g, "\t")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
            }
            params.content = contentRaw;
          }

          return { tool: toolName, parameters: params };
        }
      }
      throw new Error("JSON parse hatası");
    };

    const tryAddCall = (rawJson: string, langTag: string = "") => {
      try {
        const parsed = repairAndParseJson(rawJson);
        const hasExplicitToolField = typeof parsed.tool === "string" && Boolean(parsed.tool);
        const isTaggedAsTool = langTag.startsWith("tool") || langTag === "json:tool_call";

        let toolName: string | undefined;
        if (hasExplicitToolField) {
          toolName = parsed.tool;
        } else if (isTaggedAsTool) {
          toolName = parsed.tool || parsed.name || parsed.function;
        }

        if (toolName && typeof toolName === "string") {
          const params = (parsed.parameters || parsed.arguments || parsed.args || parsed.params || {}) as Record<string, unknown>;
          const key = `${toolName}:${JSON.stringify(params)}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push({
              tool: toolName,
              parameters: typeof params === "object" && params !== null ? params : {},
            });
          }
        }
      } catch {
        // Geçersiz JSON
      }
    };

    // 1. Standart kod bloğu eşleştirmesi
    const regex = /```(tool_call|json:tool_call|tool|tools|json)?\n?(\{[\s\S]*?\})\n?```/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      tryAddCall(match[2].trim(), (match[1] || "").toLowerCase());
    }

    // 1b. Eğer kapanmamış ```tool_call bloğu varsa yakala
    if (calls.length === 0) {
      const unclosedMatch = /```(tool_call|json:tool_call|tool|tools|json)?\n?(\{[\s\S]*)$/.exec(text);
      if (unclosedMatch) {
        tryAddCall(unclosedMatch[2].trim(), (unclosedMatch[1] || "").toLowerCase());
      }
    }

    // 2. Eğer kod bloğu bulunamadıysa, çıplak {"tool": ...} bloklarını dengeli parantez ile bul
    if (calls.length === 0) {
      let searchIdx = 0;
      while (searchIdx < text.length) {
        const toolMatch = text.slice(searchIdx).match(/\{[\s\r\n]*"(?:tool|function)"/);
        if (!toolMatch || toolMatch.index === undefined) break;
        const start = searchIdx + toolMatch.index;
        let braceCount = 0;
        let end = -1;
        let inString = false;
        let escape = false;

        for (let i = start; i < text.length; i++) {
          const char = text[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (char === "\\") {
            escape = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === "{") braceCount++;
            else if (char === "}") {
              braceCount--;
              if (braceCount === 0) {
                end = i;
                break;
              }
            }
          }
        }

        if (end !== -1) {
          tryAddCall(text.slice(start, end + 1).trim());
          searchIdx = end + 1;
        } else {
          searchIdx = start + 8;
        }
      }
    }

    // 3. Akıllı Niyet Kurtarma (Heuristic Command Intent Recovery):
    // Model "şimdi `npx tsc --noEmit` çalıştırıyorum" veya "npx tsc --noEmit ile syntax kontrolünü yapıyorum"
    // deyip ```tool_call bloğunu unuttuysa, komutu yakala ve run_command aracına dönüştür
    if (calls.length === 0) {
      const inlineCmdPatterns = [
        /(?:çalıştırıyorum|yapıyorum|başlatıyorum|kontrol\s*ediyorum|deniyorum)[^`\n]*`([a-zA-Z0-9_\-\.\/: ]+)`/i,
        /`([a-zA-Z0-9_\-\.\/: ]+)`[^`\n]*(?:çalıştırıyorum|yapıyorum|başlatıyorum|kontrol\s*ediyorum|ile\s*kontrol|ile\s*syntax|doğruluyorum)/i,
        /(?:başlatıyorum|yapıyorum|çalıştırıyorum|kontrol\s*ediyorum):\s*`([a-zA-Z0-9_\-\.\/: ]+)`/i,
        /```(?:bash|sh|shell|zsh)\n([^\n]+)\n```/i,
      ];
      for (const pat of inlineCmdPatterns) {
        const m = pat.exec(text);
        if (m && m[1]) {
          const candidateCmd = m[1].trim();
          const SHELL_PREFIXES = /^(?:npm|npx|pnpm|yarn|git|python|pytest|tsc|cargo|go|node|ls|cat|rm|mkdir|curl|chmod|find|touch|cd|docker)\b/i;
          if (SHELL_PREFIXES.test(candidateCmd) || candidateCmd.split(" ").length >= 2) {
            calls.push({
              tool: "run_command",
              parameters: { command: candidateCmd },
            });
            break;
          }
        }
      }
    }

    return calls;
  }
}

export const pluginManager = new PluginManager();
