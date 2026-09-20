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
      "=== ACTIVE PLUGINS AND TOOLS (TOOL USE) ===",
      "IMPORTANT AND STRICT RULES:",
      "1. You are an autonomous AI agent that DIRECTLY EXECUTES commands, searches, and file operations yourself.",
      "2. NEVER tell the user 'Please run this command' or 'Enter the following command'! YOU MUST issue operations using the ```tool_call``` format.",
      "3. Never write fake text explanations like 'Parameters' or 'query:'! ONLY produce a valid JSON ```tool_call``` block.",
      "",
      "EXAMPLE TOOL CALLS:",
      "User: 'Can you search the web for the latest Next.js version?'",
      "Assistant:",
      "```tool_call",
      '{"tool": "web_search", "parameters": {"query": "Next.js latest release npm version"}}',
      "```",
      "",
      "User: 'Inspect project state and files'",
      "Assistant:",
      "```tool_call",
      '{"tool": "get_codebase_summary", "parameters": {}}',
      "```",
      "",
      "AVAILABLE TOOLS:",
    ];

    for (const plugin of activePlugins) {
      lines.push(`\n[Plugin: ${plugin.name}]`);
      if (plugin.systemPromptContribution) {
        lines.push(plugin.systemPromptContribution(context));
      }
      for (const tool of plugin.tools) {
        const paramKeys = Object.keys(tool.parameters);
        const paramsDesc = paramKeys.length > 0
          ? paramKeys.map((k) => `    * ${k} (${tool.parameters[k].type}${tool.parameters[k].required ? ", required" : ""}): ${tool.parameters[k].description}`).join("\n")
          : "    (No parameters required)";
        lines.push(`  - Tool: \`${tool.name}\` — ${tool.description}\n    Parameters:\n${paramsDesc}`);
      }
    }

    lines.push("\nWhen you execute a tool, the system will return the result. Then provide your final answer to the user.");
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

  /** Yanıttaki ```tool_call ... ``` veya ```json ... ``` veya _call {...} araç çağrı bloklarını ayrıştırır */
  extractToolCalls(text: string): Array<{ tool: string; parameters: Record<string, unknown> }> {
    const calls: Array<{ tool: string; parameters: Record<string, unknown> }> = [];
    const seenTools = new Set<string>();

    const parseAndAdd = (rawJson: string, langTag = "") => {
      try {
        let cleaned = rawJson.trim();
        if (cleaned.endsWith(")")) cleaned = cleaned.slice(0, -1).trim();
        if (cleaned.endsWith(";")) cleaned = cleaned.slice(0, -1).trim();
        const parsed = JSON.parse(cleaned);
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
          if (!seenTools.has(key)) {
            seenTools.add(key);
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

    // Dengeli parantez (balanced braces) ile iç içe JSON objelerini eksiksiz çıkar
    const extractBalancedJsonObjects = (src: string): string[] => {
      const results: string[] = [];
      let depth = 0;
      let startIdx = -1;
      let inString = false;
      let escape = false;

      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === "{") {
            if (depth === 0) startIdx = i;
            depth++;
          } else if (ch === "}") {
            depth--;
            if (depth === 0 && startIdx !== -1) {
              results.push(src.slice(startIdx, i + 1));
              startIdx = -1;
            } else if (depth < 0) {
              depth = 0;
              startIdx = -1;
            }
          }
        }
      }
      return results;
    };

    // 1. Markdown kod blokları içindeki JSON'ları çıkar
    const blockRegex = /```(?:tool_call|json:tool_call|tool|tools|json)?\n?([\s\S]*?)(?:```|$)/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(text)) !== null) {
      const blockContent = match[1];
      const jsons = extractBalancedJsonObjects(blockContent);
      for (const j of jsons) {
        parseAndAdd(j, "tool_call");
      }
    }

    // 2. Blok dışındaki ham `tool_call\n{...}` veya düz JSON objelerini de dengeli şekilde yakala
    const allJsons = extractBalancedJsonObjects(text);
    for (const j of allJsons) {
      if (j.includes('"tool"') || j.includes('"parameters"')) {
        parseAndAdd(j, "tool_call");
      }
    }

    return calls;
  }
}

export const pluginManager = new PluginManager();
