// src/lib/webSearch.ts
// Web Arama Motoru:
//   1. Tavily AI Search (TAVILY_API_KEY varsa) — AI-agent optimize
//   2. DuckDuckGo HTML & Instant Answer Fallback (key gerektirmez, gerçek web sonuçları çeker)

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  answer?: string; // AI veya özet cevap
  backend: "tavily" | "duckduckgo" | "error";
  error?: string;
}

// ─── Tavily AI Search ────────────────────────────────────────────────────────

async function searchTavily(
  query: string,
  apiKey: string,
  maxResults = 5
): Promise<WebSearchResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    query,
    backend: "tavily",
    answer: data.answer ?? undefined,
    results: (data.results ?? []).map(
      (r: { title: string; url: string; content?: string; snippet?: string; score?: number }) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? r.snippet ?? "",
        score: r.score,
      })
    ),
  };
}

// ─── NPM Registry Doğrudan Paket Arama (Sürüm & Paket Bilgisi) ─────────────
async function searchNpmRegistry(query: string): Promise<SearchResult | null> {
  const q = query.toLowerCase();
  const pkgMatch = /\b(next\.?js|next|react|typescript|tailwindcss|tailwind|vue|svelte|express|prisma|zustand|axios|vite|turbo|bun|hono)\b/i.exec(q);
  if (!pkgMatch) return null;

  let pkgName = pkgMatch[1].toLowerCase();
  if (pkgName === "next.js") pkgName = "next";
  if (pkgName === "tailwindcss") pkgName = "tailwindcss";

  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      headers: { "User-Agent": "MYF-Agent/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: `${data.name} v${data.version} - npm Official Registry`,
      url: `https://www.npmjs.com/package/${data.name}`,
      snippet: `En güncel resmi ${data.name} sürümü: ${data.version}. Açıklama: ${data.description || "NPM Paketi"}. Lisans: ${data.license || "MIT"}. Kurulum: npm i ${data.name}@${data.version}`,
      score: 1.0,
    };
  } catch {
    return null;
  }
}

// ─── DuckDuckGo Canlı HTML & Lite Arama Fallback ──────────────────────────────

async function searchDuckDuckGoLite(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];

    // Lite tablosunu satır satır tara
    const snippetRe = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
    const linkRe = /<a[^>]*class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;

    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null && snippets.length < maxResults) {
      const clean = sm[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      if (clean) snippets.push(clean);
    }

    const links: Array<{ url: string; title: string }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null && links.length < maxResults) {
      let u = lm[1];
      if (u.includes("uddg=")) {
        const uddg = /uddg=([^&]+)/.exec(u);
        if (uddg) u = decodeURIComponent(uddg[1]);
      }
      const title = lm[2].replace(/<[^>]+>/g, "").trim();
      links.push({ url: u, title });
    }

    for (let i = 0; i < snippets.length; i++) {
      const linkInfo = links[i] || { url: "https://duckduckgo.com", title: `Arama Sonucu ${i + 1}` };
      results.push({
        title: linkInfo.title,
        url: linkInfo.url,
        snippet: snippets[i],
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function searchDuckDuckGoHtml(query: string, maxResults = 5): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!res.ok) return [];

  const html = await res.text();
  const results: SearchResult[] = [];

  const snippetRe = /<a[^>]*class=['"][^'"]*result__snippet[^'"]*['"][^>]*href=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const rawMatches: Array<{ rawUrl: string; snippet: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = snippetRe.exec(html)) !== null && rawMatches.length < maxResults) {
    const rawUrl = m[1];
    const cleanSnippet = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
    if (cleanSnippet) {
      rawMatches.push({ rawUrl, snippet: cleanSnippet });
    }
  }

  for (const item of rawMatches) {
    let cleanUrl = item.rawUrl;
    if (cleanUrl.includes("uddg=")) {
      const uddgMatch = /uddg=([^&]+)/.exec(cleanUrl);
      if (uddgMatch) {
        cleanUrl = decodeURIComponent(uddgMatch[1]);
      }
    }
    if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;

    let title = "";
    try {
      const parsedUrl = new URL(cleanUrl);
      const pathname = parsedUrl.pathname.split("/").filter(Boolean).pop() || "";
      title = pathname ? `${parsedUrl.hostname} › ${pathname}` : parsedUrl.hostname;
    } catch {
      title = cleanUrl.slice(0, 50);
    }

    results.push({
      title,
      url: cleanUrl,
      snippet: item.snippet,
    });
  }

  return results;
}

async function searchDuckDuckGo(query: string, maxResults = 5): Promise<WebSearchResponse> {
  // 1. Önce NPM paket sorgusu olup olmadığını kontrol et
  const npmRes = await searchNpmRegistry(query).catch(() => null);

  // 2. DuckDuckGo HTML dene
  let htmlResults = await searchDuckDuckGoHtml(query, maxResults).catch(() => []);

  // 3. HTML boş dönerse DuckDuckGo Lite dene
  if (htmlResults.length === 0) {
    htmlResults = await searchDuckDuckGoLite(query, maxResults).catch(() => []);
  }

  const combinedResults: SearchResult[] = [];
  if (npmRes) combinedResults.push(npmRes);
  combinedResults.push(...htmlResults);

  if (combinedResults.length > 0) {
    return {
      query,
      backend: "duckduckgo",
      answer: npmRes ? npmRes.snippet : undefined,
      results: combinedResults.slice(0, maxResults),
    };
  }

  // 4. Fallback: Instant Answer API
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "MYF-Agent/1.0" },
  });

  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const data = await res.json();
  const results: SearchResult[] = [];

  if (data.AbstractText) {
    results.push({
      title: data.Heading ?? query,
      url: data.AbstractURL ?? "",
      snippet: data.AbstractText,
    });
  }

  for (const topic of (data.RelatedTopics ?? []).slice(0, maxResults - results.length)) {
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.split(" - ")[0] ?? topic.Text.slice(0, 60),
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }
  }

  return {
    query,
    backend: "duckduckgo",
    answer: data.AbstractText || undefined,
    results: results.length > 0 ? results : (npmRes ? [npmRes] : []),
  };
}


// ─── Ana Fonksiyon ───────────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  options: { maxResults?: number } = {}
): Promise<WebSearchResponse> {
  const { maxResults = 5 } = options;
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";

  if (tavilyKey.trim()) {
    try {
      return await searchTavily(query, tavilyKey, maxResults);
    } catch (err) {
      console.warn("[webSearch] Tavily başarısız, DuckDuckGo'ya geçiliyor:", err);
    }
  }

  try {
    return await searchDuckDuckGo(query, maxResults);
  } catch (err) {
    return {
      query,
      backend: "error",
      results: [],
      error: err instanceof Error ? err.message : "Arama başarısız",
    };
  }
}

// ─── LLM Context Formatlayıcı ────────────────────────────────────────────────

export function formatSearchResultsForLLM(res: WebSearchResponse): string {
  if (res.backend === "error" || res.results.length === 0) {
    return `[WEB ARAMA: "${res.query}" için sonuç bulunamadı]`;
  }

  const lines: string[] = [`## Web Arama Sonuçları: "${res.query}" (${res.backend.toUpperCase()})`];

  if (res.answer) {
    lines.push(`\n**Özet:** ${res.answer}\n`);
  }

  res.results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**`);
    lines.push(`   ${r.snippet.slice(0, 300)}`);
    lines.push(`   Kaynak: ${r.url}`);
  });

  return lines.join("\n");
}
