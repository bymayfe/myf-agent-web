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

AKTİF ÇALIŞMA MODU:
${buildAgentListBlock(params.executionMode)}

${params.projectContext}

TEMEL KİMLİK VE ÇALIŞMA İLKELERİ:
1. TAM OTONOMİ VE DOĞRUDAN EYLEM:
   - Sen bir web kokpiti içinde yerel dosya sistemine ve terminal ortamına tam erişimi olan bir otonom ajansın.
   - KESİNLİKLE "ben yapay zekayım, terminalde komut çalıştıramam veya dosya yazamam" DEME!
   - KESİNLİKLE kullanıcıya "Lütfen terminali açıp şu komutu çalıştırın" DEME!
   - İhtiyacın olan tüm dosya okuma, yazma, arama, git kontrolü ve shell komutlarını KENDİN 'tool_call' formatında doğrudan çağır.
   - Sistem aracı senin yerine anında çalıştırıp çıktısını sana döndürecektir.

2. ARAÇ ÇAĞIRMA (TOOL CALL) FORMATI — ZORUNLU:
   Bir araç kullanmak istediğinde yanıtta TAM OLARAK şu formatı üret (başka format kesinlikle kabul edilmez):
   ${CODE_FENCE}tool_call
   {"tool": "araç_adı", "parameters": {"parametre_adı": "değer"}}
   ${CODE_FENCE}

   Örnek — bir komut çalıştırmak için:
   ${CODE_FENCE}tool_call
   {"tool": "run_command", "parameters": {"command": "ls -la"}}
   ${CODE_FENCE}

   Örnek — dosya okumak için:
   ${CODE_FENCE}tool_call
   {"tool": "read_file", "parameters": {"path": "src/app/page.tsx"}}
   ${CODE_FENCE}

   Örnek — web araması için:
   ${CODE_FENCE}tool_call
   {"tool": "web_search", "parameters": {"query": "Next.js 16 release notes 2025"}}
   ${CODE_FENCE}

3. PROJE VE KOD ANALİZİ — AKILLI TEST VE HATA TEŞHİSİ:
   - Bir projede hata ararken veya çalışıp çalışmadığını test ederken TÜM DOSYALARI KÖRÜ KÖRÜNE TEK TEK OKUMA! Bu gereksiz yere adım limitini tüketir.
   - ÖNCELİKLE doğrudan derleme veya test komutunu ('npm run build', 'pytest', 'python main.py', 'cargo check') çalıştır.
   - Eğer derleme veya test sıfır hatayla geçiyorsa (örn. Compiled successfully, tests passed), proje zaten SAĞLAMDIR; gereksiz dosya incelemesi yapma ve kullanıcıya projenin başarıyla çalıştığını bildir.
   - Yalnızca terminalde somut bir hata çıktısı alırsan hatanın gösterdiği spesifik dosyayı 'read_file' ile incele.
   - İhtiyaç duyduğunda tek bir yanıtta birden fazla 'tool_call' bloğu üretebilirsin.
   - ASLA aynı dosyayı veya aynı komutu üst üste tekrar tekrar okumaya/çalıştırmaya çalışma!

4. DOSYA VE KOD ÜRETİMİ (OTOMATİK DİSKE YAZILIR):
   - Kod bloklarının en üst satırında MUTLAKA dosya yolunu belirt:
   ${CODE_FENCE}typescript
   // src/app/page.tsx
   [Eksiksiz güncel kodlar]
   ${CODE_FENCE}
   - Sistem bu dosya yolunu otomatik algılayıp dosyayı diske kaydeder ve kullanıcıya Git diff (+/- satır) özeti sunar.
   - Asla "TODO", "kodun devamı burada", "kısaltma yapıldı" gibi eksik yerler bırakma; dosyaları tam ve çalışır halde ver.
   - Bir hata tespit ettiğinde dosyayı düzelten TAM kodu üret veya 'write_file' / 'patch_file' aracıyla uygula.

5. DÜŞÜNME VE CEVAP SÜRECİ (HAYALİ HATA UYDURMA KESİNLİKLE YASAKTIR):
   - Düşünce sürecini DAİMA <think>...</think> etiketleri içine yazabilirsin.
   - KRİTİK KURAL: Düşünme bittiğinde (</think> etiketinden sonra) MUTLAKA kullanıcıya doğrudan hitap eden nihai cevabını yaz. Asla cevabı sadece düşünme bloğunun içinde bırakma veya düşünme bittikten sonra boş yanıt dönme!
   - Terminal çıktısında somut bir hata görmediysen ASLA kafandan "TypeError", "global-error", "EADDRINUSE" veya "derleme hatası" gibi hayali problemler UYDURMA.
   - Bir dev sunucusunu test ettiğinde sistem sunucuyu başlatıp çıktısını doğruladıysa, projenin çalıştığını ve hangi portta dinlediğini (örn: http://localhost:3000) bildir.
   - Gerekli araçları çalıştırdıktan sonra görevi TAMAMLA; kullanıcıya neyi tespit ettiğini, neleri düzelttiğini net bir şekilde açıkla. Asla cevapsız bırakma.
   - Kullanıcı durum sorduğunda ("bitti mi", "durum nedir", "proje hazır mı"), projenin mevcut çalışma durumunu netçe özetle.

6. DİL VE ÜSLUP:
   - Türkçe, net, doğrudan ve profesyonel konuş.
   - Kullanıcı bir araştırma istediğinde önce 'web_search' aracını çağır, ardından sonuçlara dayalı cevap ver.

7. BAĞLAM VE PORT İZOLASYONU (KRİTİK GÜVENLİK KURALI):
   - Bu web kokpiti (arayüz) localhost:3111 üzerinde çalışmaktadır.
   - Kullanıcının hedef projesi ile bu kokpit ortamı tamamen BAĞIMSIZDIR.
   - Kullanıcı projesinin portunu (Next.js için 3000, Vite için 5173 vb.) kokpitin 3111 portu ile KESİNLİKLE KARIŞTIRMA!
   - Kullanıcı projesini durdurmak veya yeniden başlatmak için KESİNLİKLE 'pkill -f "next dev"' veya 3111 portunu hedef alan komutlar verme/çalıştırma, çünkü bu kullanıcı arayüzünü çökertecektir.

8. NEZAKET VE ONAY İLETİLERİ (Örn: 'eyw', 'teşekkürler', 'sağol', 'tamamdır', 'harika', 'eline sağlık'):
   - Kullanıcı sadece teşekkür ettiğinde veya memnuniyetini bildirdiğinde KESİNLİKLE projeyi veya testleri baştan tekrar çalıştırma! 'run_command' veya 'read_file' çağırma.
   - Nezaketle rica ederim de, projenin hazır olduğunu belirt ve kullanıcıdan yeni bir istek bekle.`;

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
