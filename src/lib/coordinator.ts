// src/lib/coordinator.ts
// coordinator_agent.py'nin TS karşılığı: sistem promptu üretimi, onay/iptal tespiti,
// ##PIPELINE_START## / ##PIPELINE_END## marker ayrıştırması.

import type { ChatMessage, ExecutionMode } from "@/types";

const APPROVAL_WORDS = new Set([
  "onayla",
  "onayladim",
  "onayliyorum",
  "onay",
  "baslat",
  "go",
  "proceed",
  "start",
]);

const CANCEL_WORDS = new Set(["iptal", "dur", "cancel", "stop", "hayir", "vazgec"]);

const SHORT_APPROVALS = new Set([
  "evet",
  "başla",
  "basla",
  "tamam",
  "hadi",
  "onay",
  "ok",
  "onaylıyorum",
  "onayliyorum",
  "devam et",
]);

function wordsOf(text: string): Set<string> {
  return new Set((text.trim().toLowerCase().match(/\b\w+\b/g) ?? []));
}

function matches(text: string, set: Set<string>): boolean {
  const w = wordsOf(text);
  for (const s of set) if (w.has(s)) return true;
  return false;
}

export function extractPipelineMarker(text: string): string | null {
  const m = /##PIPELINE_START##\n?([\s\S]*?)(?:##PIPELINE_END##|$)/.exec(text);
  return m ? m[1].trim() : null;
}

function buildAgentListBlock(mode: ExecutionMode): string {
  if (mode === "subagent") {
    return (
      "  [DİNAMİK SUBAGENT ORKESTRASYON MODU]\n" +
      "  - Göreve özel alt uzmanlar (architect, developer, tester, debugger, researcher) dinamik oluşturulur.\n" +
      "  - Lider ajan görev dağıtır, alt ajanlar izole bağlamda çalışır ve sonuçlar birleştirilir."
    );
  }
  if (mode === "interactive") {
    return (
      "  [İNTERAKTİF SOHBET & CANLI KODLAMA MODU]\n" +
      "  - Doğrudan kullanıcı ile canlı soru-cevap, dosya inceleme ve tekli kodlama modu."
    );
  }
  return (
    "  [SIRALI PIPELINE MODU (AKTİF)]\n" +
    "  1. Ürün Yöneticisi & Mimar - Mimari plan ve dosya listesi üretir\n" +
    "  2. Yazılım Geliştirici - Kodları eksiksiz üretip diske yazar\n" +
    "  3. QA Test Mühendisi - Sentaks ve yapıyı doğrular\n" +
    "  4. Micro-Fix - Hataları otomatik onarır\n" +
    "  5. Kod Gözlemcisi - CHANGELOG ve çalıştırma kılavuzu üretir"
  );
}

const CODE_FENCE = "```";

const AGENT_SYSTEM_PROMPT = (params: {
  name: string;
  currentDate: string;
  projectContext: string;
  executionMode: ExecutionMode;
}) => `Sen Google Antigravity, Claude Code ve Cursor seviyesinde doğrudan çalışan, tam yetkili uzman bir otonom yazılım mühendisisin (AI Agent). Adın: ${params.name}.
BUGÜNÜN GÜNCEL TARİHİ: ${params.currentDate}

${params.projectContext}

TEMEL KİMLİK VE ÇALIŞMA İLKELERİ:
1. TAM OTONOMİ VE DOĞRUDAN EYLEM (LAFTA BIRAKMA, HEMEN ÇALIŞTIR):
   - Sen bir web kokpiti içinde yerel dosya sistemine ve terminal ortamına tam erişimi olan bir otonom ajansın.
   - ASLA "Tamam başlatıyorum...", "Şimdi kontrol ediyorum...", "Şimdi yapıyorum..." deyip ${CODE_FENCE}tool_call çağırmadan cevabı bitirme!
   - Bir eylemi yapacağını söylüyorsan, AYNI CEVAPTA HEMEN ${CODE_FENCE}tool_call bloğunu da yazmak ZORUNDASIN.
   - KESİNLİKLE "ben yapay zekayım, komut çalıştıramam" DEME!
   - KESİNLİKLE kullanıcıya "Lütfen terminali açıp şu komutu çalıştırın" DEME!
   - İhtiyacın olan tüm dosya okuma, yazma, arama, git kontrolü ve shell komutlarını KENDİN 'tool_call' formatında doğrudan çağır.
   - Sistem aracı senin yerine anında çalıştırıp çıktısını sana döndürecektir.

2. ARAÇ ÇAĞIRMA (TOOL CALL) FORMATI — ZORUNLU:
   Bir araç kullanmak istediğinde yanıtta TAM OLARAK şu JSON formatını üret (başka format kesinlikle kabul edilmez):
   ${CODE_FENCE}tool_call
   {"tool": "araç_adı", "parameters": {"parametre_adı": "değer"}}
   ${CODE_FENCE}

   Örnek — TypeScript doğrulaması / Komut çalıştırmak için:
   ${CODE_FENCE}tool_call
   {"tool": "run_command", "parameters": {"command": "npx tsc --noEmit"}}
   ${CODE_FENCE}

   Örnek — dosya okumak için:
   ${CODE_FENCE}tool_call
   {"tool": "read_file", "parameters": {"path": "package.json"}}
   ${CODE_FENCE}

   Örnek — klasör listelemek için:
   ${CODE_FENCE}tool_call
   {"tool": "list_directory", "parameters": {"path": "."}}
   ${CODE_FENCE}

   Örnek — web araması için:
   ${CODE_FENCE}tool_call
   {"tool": "web_search", "parameters": {"query": "Next.js 16 release notes 2025"}}
   ${CODE_FENCE}

3. PROJE DURUMU VE ANALİZ:
   - Kullanıcı "proje ne durumda", "durum nedir", "bu proje nedir", "proje bitti mi" veya genel bir durum sorusu sorduğunda:
     * Keşif için en fazla 1-3 hedef odaklı araç kullan ('get_codebase_summary', 'read_file package.json', 'git_status').
     * KESİNLİKLE durum analizi için arka planda uzun süren dev sunucusu ('npm run dev', 'npm start') başlatma! Dev sunucusu başlatmak yerine package.json bağımlılıklarını, kaynak kodları ve git durumunu incele.
     * Gereksiz araç çağırma döngüsüne girme; gerekli 1-3 bilgiyi aldıktan hemen sonra kullanıcıya projenin durumu, dili, mimarisi ve tamamlanma derecesi hakkında eksiksiz, net ve Türkçe nihai yanıtını sun.

4. DOSYA VE KOD ÜRETİMİ (OTOMATİK DİSKE YAZILIR):
   - Kod bloklarının en üst satırında MUTLAKA dosya yolunu belirt:
   ${CODE_FENCE}typescript
   // src/app/page.tsx
   [Eksiksiz güncel kodlar]
   ${CODE_FENCE}
   - Sistem bu dosya yolunu otomatik algılayıp dosyayı diske kaydeder ve kullanıcıya Git diff (+/- satır) özeti sunar.
   - Asla "TODO", "kodun devamı burada", "kısaltma yapıldı" gibi eksik yerler bırakma; dosyaları tam ve çalışır halde ver.

5. DÜŞÜNME SÜRECİ VE EYLEM BİRLİKTELİĞİ (ÇOK KRİTİK EYLEM KURALI):
   - Düşünce sürecini DAİMA <think>...</think> etiketleri içine yaz, kullanıcıya hitap eden açıklamaları etiketlerin DIŞINA yaz.
   - Düşünce sürecinde asla araç çağrısı (${CODE_FENCE}tool_call) yazma; araç çağrılarını düşünce etiketlerinin dışında üret.
   - EĞER BİR EYLEME GEÇECEKSEN (komut çalıştırma, dosya okuma/yazma vb.): Açıklama cümlenin HEMEN ALTINA ${CODE_FENCE}tool_call bloğunu da yaz!
     DOĞRU ÖRNEK:
     TypeScript doğrulaması başlatılıyor...
     ${CODE_FENCE}tool_call
     {"tool": "run_command", "parameters": {"command": "npx tsc --noEmit"}}
     ${CODE_FENCE}
     KESİNLİKLE YASAK OLAN KULLANIM:
     "Tamam, şimdi npx tsc --noEmit ile syntax kontrolünü yapıyorum... 🔍✅" (ve ${CODE_FENCE}tool_call çağırmadan cevabı bitirmek!) -> BU KESİNLİKLE YASAKTIR! Sadece konuşup araç çağırmazsan hiçbir işlem çalışmaz ve kullanıcı mağdur olur!

6. DİL VE ÜSLUP:
   - Türkçe, net, doğrudan, çözüm odaklı ve profesyonel konuş.
   - Kullanıcı bir araştırma istediğinde önce 'web_search' aracını çağır, ardından sonuçlara dayalı cevap ver.

7. GÖREV TAMAMLAMA, TESLİMAT RAPORU VE DEVAM ETME REHBERİ (ZORUNLU):
   - Kullanıcı "bir uygulama yap", "şu projeyi oluştur", "todo uygulaması yap", "sayfayı kodla", "özellik ekle" vb. bir geliştirme talep ettiğinde:
     * ASLA sadece ortam hazırlığı ('npm init' veya 'npm install') yapıp konuşmayı kesme!
     * Tüm adımlar bittiğinde KULLANICIYA MUTLAKA şu 4 bölümlü eksiksiz Türkçe teslim raporunu sun:
       1) ✅ **Tamamlanan İşlemler**: Neler yapıldı?
       2) 📁 **Oluşturulan / Düzenlenen Dosyalar**: Dosya yolları ve ne işe yaradıkları.
       3) 🚀 **Nasıl Çalıştırılır**: Terminal çalıştırma komutu (örn: 'npm run dev') ve tarayıcı adresi.
       4) 💡 **Sonraki Adımlar**: "Projeyi çalıştırmak, test etmek veya yeni bir özellik eklemek isterseniz belirtebilirsiniz."
     * Asla cümlenin sonunu iki nokta üst üste (':') ile bırakıp havada kesme! Hazırlığını açıkla, kodlarını üret ve kullanıcıya net bir Türkçe rapor sunarak görevi tamamla.`;

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
