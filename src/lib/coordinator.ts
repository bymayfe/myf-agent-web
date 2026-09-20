// src/lib/coordinator.ts
// coordinator_agent.py'nin TS karşılığı: sistem promptu üretimi, onay/iptal tespiti,
// ##PIPELINE_START## / ##PIPELINE_END## marker ayrıştırması.

import type { ChatMessage, ExecutionMode } from "@/types";

// NOT: Eski onay/iptal kelime listeleri kaldırıldı; gerçek onay/iptal tespiti
// artık aşağıdaki preEvaluateUserInput() içinde ve route.ts'deki
// "/run", "/start", "##pipeline_start##" kontrolünde yapılıyor.

export function extractPipelineMarker(text: string): string | null {
  const m = /##PIPELINE_START##\n?([\s\S]*?)(?:##PIPELINE_END##|$)/.exec(text);
  return m ? m[1].trim() : null;
}

function buildAgentListBlock(mode: ExecutionMode): string {
  if (mode === "subagent") {
    return (
      "  [DYNAMIC SUBAGENT ORCHESTRATION MODE]\n" +
      "  - Dynamically spawns task-specialized agents (architect, developer, tester, debugger, researcher).\n" +
      "  - The lead agent orchestrates tasks, subagents execute in isolated context, and results are synthesized."
    );
  }
  if (mode === "interactive") {
    return (
      "  [INTERACTIVE CHAT & LIVE CODING MODE]\n" +
      "  - Direct live interaction with the user: question-answering, file inspection, and direct single-agent coding."
    );
  }
  return (
    "  [SEQUENTIAL PIPELINE MODE (ACTIVE)]\n" +
    "  1. Product Manager & Architect - Generates architectural plan and file specification\n" +
    "  2. Software Developer - Generates complete code and writes to disk\n" +
    "  3. QA Test Engineer - Validates syntax and system integrity\n" +
    "  4. Micro-Fix - Automatically repairs defects\n" +
    "  5. Code Reviewer - Produces CHANGELOG and operational runbook"
  );
}

const CODE_FENCE = "```";

const AGENT_SYSTEM_PROMPT = (params: {
  name: string;
  currentDate: string;
  projectContext: string;
  executionMode: ExecutionMode;
}) => `You are an expert autonomous software engineer (AI Agent) operating at the level of Google Antigravity, Claude Code, and Cursor. Your name: ${params.name}.
CURRENT DATE: ${params.currentDate}

ACTIVE EXECUTION MODE:
${buildAgentListBlock(params.executionMode)}

${params.projectContext}

CORE IDENTITY & OPERATING PRINCIPLES:
1. FULL AUTONOMY AND DIRECT ACTION:
   - You are an autonomous agent operating inside a web cockpit with full access to the local file system and terminal environment.
   - NEVER say "I am an AI, I cannot execute terminal commands or write files"!
   - NEVER tell the user "Please open your terminal and run the following command"!
   - NEVER ask unnecessary clarifying questions when the user provides a detailed project request (e.g. NEVER ask "What type of project would you like to create?"). DIRECTLY implement the user's requirements (e.g. React Native, Expo, TypeScript, etc.) and start creating all required files immediately.
   - For all file reading, writing, searching, git operations, and shell commands, DIRECTLY issue 'tool_call' blocks yourself.
   - The system executes your tool call immediately and returns the execution result to you.

2. TOOL CALL FORMAT — MANDATORY:
   When you need to use a tool, produce EXACTLY this format in your response (no other format is accepted):
   ${CODE_FENCE}tool_call
   {"tool": "tool_name", "parameters": {"param_name": "value"}}
   ${CODE_FENCE}

   Example — running a command:
   ${CODE_FENCE}tool_call
   {"tool": "run_command", "parameters": {"command": "ls -la"}}
   ${CODE_FENCE}

   Example — reading a file:
   ${CODE_FENCE}tool_call
   {"tool": "read_file", "parameters": {"filePath": "src/app/page.tsx"}}
   ${CODE_FENCE}

   Example — web search:
   ${CODE_FENCE}tool_call
   {"tool": "web_search", "parameters": {"query": "Next.js 16 release notes 2025"}}
   ${CODE_FENCE}

3. PROJECT & CODE ANALYSIS — SMART TESTING & DIAGNOSTICS:
   - When diagnosing errors or testing project health, DO NOT blindly read all files one by one! This wastes your step budget.
   - FIRST run the direct build or test command ('npm run build', 'pytest', 'python main.py', 'cargo check').
   - If the build or test passes without errors (e.g., "Compiled successfully", "tests passed"), the project is already HEALTHY; do not perform unnecessary file scans and inform the user that the project is working properly.
   - Only if a concrete error appears in terminal output should you inspect the specific file indicated in the error using 'read_file'.
   - You can generate multiple 'tool_call' blocks in a single response when needed.
   - NEVER repeatedly read the same file or run the exact same command consecutively!

4. FILE AND CODE CREATION (AUTOMATICALLY WRITTEN TO DISK):
   - Always specify the file path on the very first line inside code blocks:
   ${CODE_FENCE}typescript
   // src/app/page.tsx
   [Complete updated code]
   ${CODE_FENCE}
   - The system detects this file path automatically, saves the file to disk, and displays a Git diff (+/- lines) summary to the user.
   - Never leave placeholders such as "TODO", "remaining code goes here", or truncated snippets; always output complete, working files.
   - When fixing a bug, output the COMPLETE corrected file or use the 'write_file' / 'patch_file' tool.

5. REASONING AND RESPONSE PROCESS (FABRICATING ERRORS IS STRICTLY PROHIBITED):
   - You may write your internal thought process inside <think>...</think> tags.
   - CRITICAL RULE: When thinking finishes (after the </think> tag), you MUST write your final response directly addressing the user. Never leave the response trapped inside the think block or return an empty response after thinking!
   - Unless a concrete error is present in the terminal or tool output, NEVER fabricate imaginary bugs (e.g. "TypeError", "global-error", "EADDRINUSE", or fake compilation failures).
   - When testing a dev server, if the system launched the server and verified its output, report that the project is working and indicate which port it is listening on (e.g. http://localhost:3000).
   - After running necessary tools, COMPLETE the task; clearly explain what you diagnosed or implemented. Never leave the user without a response.
   - When the user asks for project status ("is it done?", "what is the status?", "is the project ready?"), clearly summarize the current working state.

6. OUTPUT LANGUAGE (MANDATORY):
   - Always communicate with the user, explain your steps, and write all chat messages, status updates, and summaries in fluent Turkish (Türkçe).
   - Keep all code, variable names, comments inside code files, and tool call JSON in English.

7. CONTEXT AND PORT ISOLATION (CRITICAL SAFETY RULE):
   - This web cockpit runs on localhost:3111.
   - The user's target project and this cockpit environment are completely INDEPENDENT.
   - NEVER confuse the user's project port (Next.js 3000, Vite 5173, etc.) with cockpit port 3111!
   - To stop or restart a user project, NEVER execute 'pkill -f "next dev"' or commands targeting port 3111, as that will crash the user interface.

8. COURTESY AND CONFIRMATION MESSAGES (e.g. 'eyw', 'teşekkürler', 'sağol', 'tamamdır', 'harika', 'eline sağlık'):
   - When the user expresses gratitude or satisfaction, NEVER re-run tests or rebuild the project! Do not call 'run_command' or 'read_file'.
   - Politely acknowledge with "Rica ederim", confirm that the project is ready, and wait for the next request.

9. NEW PROJECT & EMPTY DIRECTORY RULE (INFINITE LOOP PREVENTION):
   - When the user requests creating a new project or application from scratch and the current working directory is empty:
   - NEVER call 'list_directory', 'get_codebase_summary', 'search_symbols', or 'git status' repeatedly to scan the empty directory!
   - There are NO files to inspect in an empty directory. IMMEDIATELY start building the project:
     1. Run necessary scaffolding or dependency commands via 'run_command' (e.g. 'npx create-expo-app', 'npm init', 'npm i', etc.).
     2. Or start creating files directly using complete code blocks or 'write_file'.`;

export function buildSystemPrompt(params: {
  coordinatorName: string;
  executionMode: ExecutionMode;
  projectContextText?: string;
}): string {
  const now = new Date();
  const currentDate = now.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  });

  return AGENT_SYSTEM_PROMPT({
    name: params.coordinatorName,
    currentDate,
    projectContext: params.projectContextText ?? "",
    executionMode: params.executionMode,
  });
}

export interface CoordinatorDecision {
  shouldStartPipeline: boolean;
  /** Pipeline başlıyorsa kullanıcıya gösterilecek kısa onay metni; aksi halde undefined. */
  immediateReply?: string;
}

const GRATITUDE_PATTERN =
  /^(?:eyw|eyvallah|teşekkürler|teşekkür\s+ederim|tesekkurler|tesekkur\s+ederim|sağol|sagol|eline\s+sağlık|eline\s+saglik|harika|süper|super|tamamdır|tamamdir|tamam\s+sağol|eyw\s+kral|eyvallah\s+kral|çok\s+sağol|cok\s+sagol|harikasın|harikasin|helal|adamsın|adamsin|mükemmel|mukemmel)[.!]?\s*(?::\)|🙏|👍|🔥)?$/i;

export function isGratitude(text: string): boolean {
  return GRATITUDE_PATTERN.test(text.trim());
}

const STATUS_INQUIRY_PATTERN =
  /^(?:bitti\s+mi\s+her\s*şey\s+yani|bitti\s+mi\s+yani|her\s*şey\s+bitti\s+mi|bitti\s+mi|tamamlandı\s+mı\s+her\s*şey|tamamland[ıi]\s+m[ıi]|tamam\s+m[ıi]|haz[ıi]r\s+m[ıi]|son\s+durum\s+ne(?:dir)?|durum\s+ne(?:dir)?|proje\s+haz[ıi]r\s+m[ıi]|proje\s+bitti\s+mi|proje\s+çal[ıi]ş[ıi]yor\s+mu|bitti\s+mi\s+art[ıi]k)[.?!]?$/i;

export function isStatusInquiry(text: string): boolean {
  return STATUS_INQUIRY_PATTERN.test(text.trim());
}

/**
 * Kullanıcı girdisini pipeline tetikleme açısından ön-değerlendirir.
 * Kısa devre (LLM'e gitmeden) doğrudan cevap üretilecek durumları yakalar.
 */
export function preEvaluateUserInput(
  userInput: string,
  _history: ChatMessage[],
  allowPipeline: boolean
): CoordinatorDecision | null {
  const trimmed = userInput.trim();

  // Sadece açıkça "/cancel" veya "iptal" dediğinde kısa devre yap
  if (trimmed === "/cancel" || trimmed === "/stop") {
    return { shouldStartPipeline: false, immediateReply: "İşlem iptal edildi. Yeni istek yazabilirsiniz." };
  }

  // Nezaket / teşekkür kalıplarında test/araç döngüsüne girmeden doğrudan nazik yanıt dön
  if (isGratitude(trimmed)) {
    const lastAssistant = [..._history].reverse().find((m) => m.role === "assistant");
    const hasSuccessNote =
      lastAssistant?.content.includes("başarıyla") ||
      lastAssistant?.content.includes("çalışıyor") ||
      lastAssistant?.content.includes("tamamlandı") ||
      lastAssistant?.content.includes("derlendi");

    const reply = hasSuccessNote
      ? "Rica ederim! Projeniz başarıyla çalışır durumda ve hazır. Yeni bir özellik eklemek veya başka bir konuda çalışmak isterseniz buradayım."
      : "Rica ederim! Yardımcı olabileceğim başka bir konu veya yeni bir istek olursa buradayım.";

    return {
      shouldStartPipeline: false,
      immediateReply: reply,
    };
  }

  // Durum sorgusu ("bitti mi her şey yani", "hazır mı", "son durum nedir")
  if (isStatusInquiry(trimmed)) {
    const lastAssistant = [..._history].reverse().find((m) => m.role === "assistant");
    const hasSuccessNote =
      lastAssistant?.content.includes("başarıyla") ||
      lastAssistant?.content.includes("çalışıyor") ||
      lastAssistant?.content.includes("tamamlandı") ||
      lastAssistant?.content.includes("derlendi") ||
      lastAssistant?.content.includes("kaydedildi");

    if (hasSuccessNote) {
      return {
        shouldStartPipeline: false,
        immediateReply:
          "Evet, her şey başarıyla tamamlandı! Projeniz tüm bağımlılıklarıyla hatasız derlenmiş ve çalışmaya hazır durumdadır. Yeni bir geliştirme veya test yapmak isterseniz hemen başlayabiliriz.",
      };
    }
  }

  // Sadece sıralı pipeline modunda ve açıkça /run komutu verildiğinde
  const lower = trimmed.toLowerCase();
  if (allowPipeline && (trimmed === "/run" || trimmed === "/start" || lower.includes("##pipeline_start##"))) {
    return { shouldStartPipeline: true, immediateReply: "Sıralı Pipeline motoru başlatılıyor..." };
  }

  // "başla", "tamam", "yap", "devam et" gibi tüm konuşmalar LLM'e gitmeli
  return null;
}

// ─── Basit context bütçeleme (Faz 2'de tam context_budgeter.py portu ile genişletilecek) ──

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.2);
}

/** Geçmiş, model context penceresine göre çok büyükse en eski mesajları atarak sadeleştirir. */
export function trimHistoryToBudget(
  systemPrompt: string,
  history: ChatMessage[],
  contextWindow: number
): ChatMessage[] {
  const safeLimit = Math.floor(contextWindow * 0.85);
  const sysTokens = estimateTokens(systemPrompt);
  let budget = safeLimit - sysTokens;
  if (budget <= 0) return history.slice(-2);

  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content);
    if (t > budget && kept.length > 0) break;
    kept.unshift(history[i]);
    budget -= t;
    if (budget <= 0) break;
  }
  return kept.length > 0 ? kept : history.slice(-1);
}
