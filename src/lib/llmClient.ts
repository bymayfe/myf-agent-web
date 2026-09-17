// src/lib/llmClient.ts
// Streaming LLM çağrı katmanı. Python'daki ollama_client.py + llm_client.py'nin
// birleşik TS karşılığı. Ollama için doğrudan NDJSON /api/chat, diğer sağlayıcılar
// için OpenAI-uyumlu SSE (Chat Completions) kullanılır.

import type { ChatMessage, TokenType } from "@/types";

export type OnToken = (token: string, type: TokenType) => void;

interface OllamaChatChunk {
  message?: { content?: string; thinking?: string };
  thinking?: string;
  done?: boolean;
}

interface OpenAiCompatChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      thinking?: string;
    };
  }>;
}

export interface CallLlmOptions {
  messages: ChatMessage[];
  model: string; // "ollama/qwen3.8:latest" veya "openai/deepseek-ai/..." gibi provider-prefixed
  apiBase: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  thinkMode?: boolean;
  warmup?: boolean;
  contextWindow?: number;
  onToken?: OnToken;
  signal?: AbortSignal;
}

export function isOllamaProvider(model: string, apiBase: string): boolean {
  const b = (apiBase || "").toLowerCase();
  const cloudMarkers = [
    "nvidia.com",
    "openrouter.ai",
    "moonshot.cn",
    "deepseek.com",
    "openai.com",
    "anthropic.com",
    "googleapis.com",
  ];
  if (cloudMarkers.some((m) => b.includes(m))) return false;
  const m = (model || "").toLowerCase();
  return m.includes("ollama") || b.includes("localhost:11434") || b.includes("127.0.0.1:11434");
}

function stripProviderPrefix(model: string): string {
  // "ollama/qwen3.8:latest" -> "qwen3.8:latest" ; "openai/deepseek-ai/x" -> "deepseek-ai/x"
  const idx = model.indexOf("/");
  return idx === -1 ? model : model.slice(idx + 1);
}

/**
 * Sıfır gecikmeli (zero-lag) akış düşünme ayrıştırıcısı.
 *
 * llama.cpp ve ham OpenAI uyumlu çıkarım motorlarından gelen metin akışındaki
 * `<think>...</think>` ve `<thought>...</thought>` etiketlerini canlı ayrıştırır.
 *
 * - Düşünce içi token'lar: onToken(chunk, "thinking")
 * - Düşünce dışı asıl cevap: onToken(chunk, "content")
 * - Etiketlerin kendisi (<think>, </think>) temizlenir, kullanıcı ekranına veya asıl cevaba karışmaz.
 * - Etiket parçası olabilecek ön ekler (örn: "<", "<th", "</th") haricinde hiçbir metin bekletilmez.
 */
export function createStreamThinkingParser(onToken?: OnToken) {
  let insideThink = false;
  let buffer = "";
  let fullContent = "";
  let fullThinking = "";

  const OPEN_TAGS = ["<think>", "<thought>", "<|thought|>"];
  const CLOSE_TAGS = ["</think>", "</thought>", "<|/thought|>"];

  function getPotentialTagPrefixLength(str: string, tags: string[]): number {
    for (let len = Math.min(str.length, 12); len >= 1; len--) {
      const slice = str.slice(-len);
      if (tags.some((tag) => tag.startsWith(slice))) {
        return len;
      }
    }
    return 0;
  }

  function emit(text: string, type: TokenType) {
    if (!text) return;
    if (type === "thinking") {
      fullThinking += text;
    } else {
      fullContent += text;
    }
    opts_onToken(text, type);
  }

  function opts_onToken(text: string, type: TokenType) {
    onToken?.(text, type);
  }

  return {
    feed(chunk: string) {
      if (!chunk) return;
      buffer += chunk;

      while (buffer.length > 0) {
        if (!insideThink) {
          let foundOpenTag: { tag: string; index: number } | null = null;
          for (const tag of OPEN_TAGS) {
            const idx = buffer.indexOf(tag);
            if (idx !== -1 && (foundOpenTag === null || idx < foundOpenTag.index)) {
              foundOpenTag = { tag, index: idx };
            }
          }

          if (foundOpenTag) {
            const before = buffer.slice(0, foundOpenTag.index);
            emit(before, "content");
            insideThink = true;
            buffer = buffer.slice(foundOpenTag.index + foundOpenTag.tag.length);
            if (buffer.startsWith("\n")) {
              buffer = buffer.slice(1);
            }
            continue;
          }

          const prefixLen = getPotentialTagPrefixLength(buffer, OPEN_TAGS);
          if (prefixLen > 0) {
            const safeLen = buffer.length - prefixLen;
            if (safeLen > 0) {
              const safeText = buffer.slice(0, safeLen);
              emit(safeText, "content");
              buffer = buffer.slice(safeLen);
            }
            break;
          } else {
            emit(buffer, "content");
            buffer = "";
            break;
          }
        } else {
          let foundCloseTag: { tag: string; index: number } | null = null;
          for (const tag of CLOSE_TAGS) {
            const idx = buffer.indexOf(tag);
            if (idx !== -1 && (foundCloseTag === null || idx < foundCloseTag.index)) {
              foundCloseTag = { tag, index: idx };
            }
          }

          if (foundCloseTag) {
            const thinkText = buffer.slice(0, foundCloseTag.index);
            emit(thinkText, "thinking");
            insideThink = false;
            buffer = buffer.slice(foundCloseTag.index + foundCloseTag.tag.length);
            if (buffer.startsWith("\n\n")) {
              buffer = buffer.slice(2);
            } else if (buffer.startsWith("\n")) {
              buffer = buffer.slice(1);
            }
            continue;
          }

          const prefixLen = getPotentialTagPrefixLength(buffer, CLOSE_TAGS);
          if (prefixLen > 0) {
            const safeLen = buffer.length - prefixLen;
            if (safeLen > 0) {
              const safeText = buffer.slice(0, safeLen);
              emit(safeText, "thinking");
              buffer = buffer.slice(safeLen);
            }
            break;
          } else {
            emit(buffer, "thinking");
            buffer = "";
            break;
          }
        }
      }
    },

    flush() {
      if (buffer.length > 0) {
        emit(buffer, insideThink ? "thinking" : "content");
        buffer = "";
      }
    },

    get fullContent() {
      return fullContent;
    },

    get fullThinking() {
      return fullThinking;
    },

    get insideThink() {
      return insideThink;
    },
  };
}

/** Ollama /api/chat NDJSON streaming çağrısı. Doğal thinking ve content ayrıştırması. */
async function callOllamaChat(opts: CallLlmOptions): Promise<string> {
  const modelName = stripProviderPrefix(opts.model);
  const endpoint = `${opts.apiBase.replace(/\/$/, "")}/api/chat`;

  // Context window: Model için belirlenen pencere veya VRAM emniyetli dinamik değer
  const numCtx = opts.contextWindow ?? (modelName.includes("27b") ? 4096 : 8192);
  const numPredict = opts.maxTokens ?? 8192;
  // Modeli bellekte sıcak tutma (keep_alive: -1 süresiz VRAM'de tutar)
  const keepAlive = opts.warmup ? -1 : "5m";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      model: modelName,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      keep_alive: keepAlive,
      options: {
        temperature: opts.temperature ?? 0.2,
        top_p: opts.topP ?? 0.95,
        top_k: opts.topK ?? 40,
        num_predict: numPredict,
        num_ctx: numCtx,
      },
    }),
  }).catch((err) => {
    if (opts.signal?.aborted) {
      throw new DOMException("İşlem kullanıcı tarafından durduruldu", "AbortError");
    }
    throw new Error(
      `Ollama sunucusuna ulaşılamıyor (${opts.apiBase}). "ollama serve" komutuyla Ollama'yı başlattığından emin ol.`
    );
  });

  if (!res.ok || !res.body) {
    throw new Error(
      `Ollama sunucusuna bağlanılamadı (${endpoint}). 'ollama serve' çalışıyor mu kontrol et. HTTP ${res.status}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }

      const msg = chunk.message ?? {};
      const contentToken: string = msg.content ?? "";
      const thinkingToken: string = msg.thinking ?? chunk.thinking ?? "";

      if (thinkingToken) {
        opts.onToken?.(thinkingToken, "thinking");
      }

      if (contentToken) {
        fullContent += contentToken;
        opts.onToken?.(contentToken, "content");
      }

      if (chunk.done) {
        return fullContent.trim();
      }
    }
  }

  return fullContent.trim();
}

function detectRepetition(text: string): boolean {
  if (text.length < 120) return false;
  const tail = text.slice(-300);
  for (let len = 20; len <= 80; len++) {
    const chunk = tail.slice(-len);
    const tripleChunk = chunk + chunk + chunk;
    if (tail.endsWith(tripleChunk)) {
      return true;
    }
  }
  return false;
}

/**
 * OpenAI-uyumlu Chat Completions SSE streaming
 * (NVIDIA NIM, OpenRouter, Moonshot, LM Studio, llama.cpp).
 *
 * Desteklenen think akışları:
 *   1. delta.reasoning_content / delta.thinking  (DeepSeek, NVIDIA NIM, modern llama-server)
 *   2. inline <think>...</think> / <thought>...</thought> içerik stream'i (llama.cpp GGUF native)
 */
async function callOpenAiCompatChat(opts: CallLlmOptions): Promise<string> {
  const modelName = stripProviderPrefix(opts.model);
  const endpoint = `${opts.apiBase.replace(/\/$/, "")}/chat/completions`;

  const res = await fetch(endpoint, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      // llama.cpp tek-model server: model adı boş veya "default" ise gönderme
      ...(modelName && modelName !== "default" ? { model: modelName } : {}),
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 8192,
      top_p: opts.topP ?? 0.95,
      ...(opts.topK !== undefined ? { top_k: opts.topK } : {}),
      stream: true,
      // Qwen3 / DeepSeek ailesi için thinking modu (llama.cpp + lm_studio + openai compat)
      ...(opts.thinkMode
        ? {
            chat_template_kwargs: { enable_thinking: true },
            thinking: { type: "enabled" },
          }
        : {
            chat_template_kwargs: { enable_thinking: false },
          }),
    }),
  }).catch((err) => {
    if (opts.signal?.aborted) {
      throw new DOMException("İşlem kullanıcı tarafından durduruldu", "AbortError");
    }
    throw new Error(
      `Sağlayıcıya ulaşılamıyor (${opts.apiBase}). Ağ bağlantısını ve api_base adresini kontrol et.`
    );
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM sağlayıcı hatası (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parser = createStreamThinkingParser(opts.onToken);
  let sawSeparateReasoning = false;
  let directContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        if (!sawSeparateReasoning) {
          parser.flush();
        }
        const finalResult = sawSeparateReasoning ? directContent : parser.fullContent;
        return finalResult.trim();
      }
      let json: OpenAiCompatChunk;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      // ── Yol 1: Ayrı reasoning alanları (DeepSeek, NVIDIA NIM, modern llama-server) ──
      const reasoning: string = delta.reasoning_content || delta.thinking || "";
      if (reasoning) {
        sawSeparateReasoning = true;
        opts.onToken?.(reasoning, "thinking");
        continue;
      }

      // ── Yol 2: İçerik akışı ────────────────────────────────────────────────────────
      if (delta.content) {
        if (sawSeparateReasoning) {
          // Model ayrı reasoning kullandı; delta.content doğrudan saf cevaptır.
          directContent += delta.content;
          opts.onToken?.(delta.content, "content");
        } else {
          // Standart llama.cpp inline <think>...</think> ayrıştırma
          parser.feed(delta.content);
        }

        const currentOutput = sawSeparateReasoning ? directContent : parser.fullContent;
        if (detectRepetition(currentOutput)) {
          break;
        }
      }
    }

    const currentOutput = sawSeparateReasoning ? directContent : parser.fullContent;
    if (detectRepetition(currentOutput)) {
      break;
    }
  }

  if (!sawSeparateReasoning) {
    parser.flush();
  }
  const finalResult = sawSeparateReasoning ? directContent : parser.fullContent;
  return finalResult.trim();
}

export async function callLlm(opts: CallLlmOptions): Promise<string> {
  if (isOllamaProvider(opts.model, opts.apiBase)) {
    return callOllamaChat(opts);
  }
  return callOpenAiCompatChat(opts);
}
