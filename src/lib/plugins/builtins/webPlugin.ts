// src/lib/plugins/builtins/webPlugin.ts
// Web Arama ve İçerik Çekme Eklentisi (Tavily AI Search + DuckDuckGo Fallback + Webpage Scraper)

import type { MyfPlugin } from "../types";
import { webSearch } from "@/lib/webSearch";

export const webPlugin: MyfPlugin = {
  id: "web-intel",
  name: "Web Intelligence & Search",
  version: "1.0.0",
  description: "Performs live web searches via Tavily AI and DuckDuckGo, reads web page contents.",
  category: "search",
  icon: "Globe",
  enabled: true,
  author: "MYF Agent Core",

  systemPromptContribution: () => {
    return `[PLUGIN: Web Intelligence & Search]
Use 'web_search' or 'fetch_webpage' when up-to-date documentation, external packages, or internet research is needed.`;
  },

  tools: [
    {
      name: "web_search",
      displayName: "Web Search",
      description: "Searches the internet and returns summary results with source links.",
      parameters: {
        query: {
          type: "string",
          description: "Keywords or question to search",
          required: true,
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 5)",
          default: 5,
        },
      },
      execute: async (params) => {
        const query = String(params.query || "").trim();
        if (!query) {
          return { success: false, output: "Search query cannot be empty." };
        }
        const maxResults = typeof params.maxResults === "number" ? params.maxResults : 5;
        const res = await webSearch(query, { maxResults });

        if (res.backend === "error") {
          return { success: false, output: `Search error: ${res.error}` };
        }

        const lines = [
          `🔍 Web Search: "${res.query}" (${res.backend.toUpperCase()} - ${res.results.length} results)`,
        ];
        if (res.answer) {
          lines.push(`\n**Summary:** ${res.answer}\n`);
        }
        res.results.forEach((r, i) => {
          lines.push(`${i + 1}. **${r.title}**`);
          lines.push(`   ${r.snippet}`);
          lines.push(`   Source: ${r.url}`);
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
      displayName: "Fetch Webpage",
      description: "Fetches the text content of a given URL and returns it as markdown.",
      parameters: {
        url: {
          type: "string",
          description: "Full URL of the webpage to read (http/https)",
          required: true,
        },
      },
      execute: async (params) => {
        const targetUrl = String(params.url || "").trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          return { success: false, output: "Please enter a valid http or https URL address." };
        }

        try {
          const res = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; MYF-Agent/1.0)" },
          });
          if (!res.ok) {
            return { success: false, output: `Failed to fetch page: HTTP ${res.status}` };
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
            output: `📄 URL: ${targetUrl}\n\nContent Summary:\n${text}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Error reading page: ${err instanceof Error ? err.message : "Unknown error"}`,
          };
        }
      },
    },
  ],
};
