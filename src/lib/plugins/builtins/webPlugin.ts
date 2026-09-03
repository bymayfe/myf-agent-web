// src/lib/plugins/builtins/webPlugin.ts
// Web Arama ve İçerik Çekme Eklentisi (Tavily AI Search + DuckDuckGo Fallback + Webpage Scraper)

import type { MyfPlugin } from "../types";
import { webSearch } from "@/lib/webSearch";

export const webPlugin: MyfPlugin = {
  id: "web-intel",
  name: "Web Intelligence & Search",
  version: "1.0.0",
  description: "Tavily AI ve DuckDuckGo ile canlı internet araması yapar, web sayfalarını okur.",
  category: "search",
  icon: "Globe",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[EKLENTİ: Web Intelligence & Search]
İnternette güncel bilgi, kütüphane dokümantasyonu veya web araştırması gerektiğinde 'web_search' veya 'fetch_webpage' araçlarını kullanabilirsin.`;
  },

  tools: [
    {
      name: "web_search",
      displayName: "Web Araması",
      description: "İnternette arama yapar ve özet sonuçlar ile kaynak linkleri döndürür.",
      parameters: {
        query: {
          type: "string",
          description: "Aranacak anahtar kelimeler veya soru",
          required: true,
        },
        maxResults: {
          type: "number",
          description: "Döndürülecek maksimum sonuç sayısı (varsayılan: 5)",
          default: 5,
        },
      },
      execute: async (params) => {
        const query = String(params.query || "").trim();
        if (!query) {
          return { success: false, output: "Arama sorgusu boş olamaz." };
        }
        const maxResults = typeof params.maxResults === "number" ? params.maxResults : 5;
        const res = await webSearch(query, { maxResults });

        if (res.backend === "error") {
          return { success: false, output: `Arama hatası: ${res.error}` };
        }

        const lines = [
          `🔍 Web Araması: "${res.query}" (${res.backend.toUpperCase()} - ${res.results.length} sonuç)`,
        ];
        if (res.answer) {
          lines.push(`\n**Özet Cevap:** ${res.answer}\n`);
        }
        res.results.forEach((r, i) => {
          lines.push(`${i + 1}. **${r.title}**`);
          lines.push(`   ${r.snippet}`);
          lines.push(`   Kaynak: ${r.url}`);
        });

        return {
          success: true,
          output: lines.join("\n"),
          data: res,
        };
      },
    },
    {
      name: "fetch_webpage",
      displayName: "Web Sayfası Oku",
      description: "Belirtilen bir URL'in metin içeriğini çeker ve markdown olarak döner.",
      parameters: {
        url: {
          type: "string",
          description: "Okunacak web sayfasının tam adresi (http/https)",
          required: true,
        },
      },
      execute: async (params) => {
        const targetUrl = String(params.url || "").trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          return { success: false, output: "Geçerli bir http veya https URL adresi girin." };
        }

        try {
          const res = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; MYF-Agent/1.0)" },
          });
          if (!res.ok) {
            return { success: false, output: `Sayfa alınamadı: HTTP ${res.status}` };
          }
          const html = await res.text();
          // Basit HTML etiket temizleme
          const text = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000); // 4000 karakterle sınırla

          return {
            success: true,
            output: `📄 URL: ${targetUrl}\n\nİçerik Özeti:\n${text}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Sayfa okunurken hata oluştu: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
          };
        }
      },
    },
  ],
};
