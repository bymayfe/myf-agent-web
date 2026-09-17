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

// ─── Paket Registry Alias & Squat Koruması ─────────────────────────────────

const NPM_PACKAGE_ALIASES: Record<string, string> = {
  "nextjs": "next",
  "next.js": "next",
  "next": "next",
  "reactjs": "react",
  "react.js": "react",
  "react": "react",
  "reactdom": "react-dom",
  "react-dom": "react-dom",
  "vuejs": "vue",
  "vue.js": "vue",
  "vue": "vue",
  "tailwindcss": "tailwindcss",
  "tailwind": "tailwindcss",
  "svelte": "svelte",
  "sveltekit": "@sveltejs/kit",
  "svelte-kit": "@sveltejs/kit",
  "nestjs": "@nestjs/core",
  "nest.js": "@nestjs/core",
  "expressjs": "express",
  "express.js": "express",
  "express": "express",
  "remix": "@remix-run/react",
  "remix.run": "@remix-run/react",
  "angular": "@angular/core",
  "angularjs": "@angular/core",
  "shadcn": "shadcn-ui",
  "shadcn-ui": "shadcn-ui",
  "lucide": "lucide-react",
  "lucide-react": "lucide-react",
  "typescript": "typescript",
  "prisma": "prisma",
  "zustand": "zustand",
  "redux": "redux",
  "axios": "axios",
  "vite": "vite",
  "turbo": "turbo",
  "bun": "bun",
  "hono": "hono",
  "zod": "zod",
  "astro": "astro",
};

const PYPI_PACKAGE_ALIASES: Record<string, string> = {
  "fastapi": "fastapi",
  "django": "django",
  "flask": "flask",
  "pydantic": "pydantic",
  "sqlalchemy": "sqlalchemy",
  "celery": "celery",
  "pytest": "pytest",
  "requests": "requests",
  "numpy": "numpy",
  "pandas": "pandas",
  "torch": "torch",
  "pytorch": "torch",
  "transformers": "transformers",
  "langchain": "langchain",
  "litellm": "litellm",
  "uvicorn": "uvicorn",
};

// Squat / terk edilmiş yanıltıcı paket bağlantılarını filtreleme deseni (örn. npmjs.com/package/nextjs 0.0.3)
const SQUAT_URL_REGEX = /https?:\/\/(?:www\.)?npmjs\.com\/package\/(?:nextjs|reactjs|vuejs|expressjs)(?:[/?#]|$)/i;

// ─── NPM & PyPI Registry Doğrudan Paket Arama (Sürüm & Paket Bilgisi) ───────
async function searchPackageRegistry(query: string): Promise<SearchResult | null> {
  const q = query.toLowerCase();

  // 1. Doğrudan paket komutları (npm i, pnpm add, pip install vs.)
  const explicitNpm = /\b(?:npm\s+(?:i|install)|yarn\s+add|pnpm\s+add|bun\s+add|package)\s+([@a-zA-Z0-9_\-\.\/]+)/i.exec(q);
  const explicitPip = /\b(?:pip\s+install|python\s+package)\s+([a-zA-Z0-9_\-\.]+)/i.exec(q);

  let matchedNpm = explicitNpm ? explicitNpm[1].toLowerCase() : null;
  let matchedPypi = explicitPip ? explicitPip[1].toLowerCase() : null;

  if (matchedNpm && NPM_PACKAGE_ALIASES[matchedNpm]) {
    matchedNpm = NPM_PACKAGE_ALIASES[matchedNpm];
  }
  if (matchedPypi && PYPI_PACKAGE_ALIASES[matchedPypi]) {
    matchedPypi = PYPI_PACKAGE_ALIASES[matchedPypi];
  }

  // 2. Cümle içi anahtar kelime eşleştirme
  if (!matchedNpm && !matchedPypi) {
    const tokens = q.match(/[a-zA-Z0-9_\.\-]+/g) || [];
    for (const t of tokens) {
      if (NPM_PACKAGE_ALIASES[t]) {
        matchedNpm = NPM_PACKAGE_ALIASES[t];
        break;
      } else if (PYPI_PACKAGE_ALIASES[t]) {
        matchedPypi = PYPI_PACKAGE_ALIASES[t];
        break;
      }
    }
  }

  // 3. NPM Registry Sorgusu
  if (matchedNpm) {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(matchedNpm)}/latest`, {
        headers: { "User-Agent": "MYF-Agent/1.0", "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const name = data.name || matchedNpm;
        const version = data.version || "Bilinmiyor";
        const desc = data.description || "NPM Paketi";
        const license = data.license || "MIT";
        return {
          title: `${name} v${version} - npm Official Registry`,
          url: `https://www.npmjs.com/package/${name}`,
          snippet: `En güncel resmi ${name} sürümü: ${version}. Açıklama: ${desc}. Lisans: ${license}. Kurulum: npm i ${name}@${version}`,
          score: 1.0,
        };
      }
    } catch {
      // devam et
    }
  }

  // 4. PyPI Registry Sorgusu
  if (matchedPypi) {
    try {
      const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(matchedPypi)}/json`, {
        headers: { "User-Agent": "MYF-Agent/1.0", "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const info = data.info || {};
        const name = info.name || matchedPypi;
        const version = info.version || "Bilinmiyor";
        const summary = info.summary || "Python Paketi";
        return {
          title: `${name} v${version} - PyPI Official Registry`,
          url: `https://pypi.org/project/${name}/`,
          snippet: `En güncel resmi ${name} sürümü: ${version}. Açıklama: ${summary}. Kurulum: pip install ${name}==${version}`,
          score: 1.0,
        };
      }
    } catch {
      // devam et
    }
  }

  return null;
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
    while ((sm = snippetRe.exec(html)) !== null && snippets.length < maxResults * 2) {
      const clean = sm[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      if (clean) snippets.push(clean);
    }

    const links: Array<{ url: string; title: string }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null && links.length < maxResults * 2) {
      let u = lm[1];
      if (u.includes("uddg=")) {
        const uddg = /uddg=([^&]+)/.exec(u);
        if (uddg) u = decodeURIComponent(uddg[1]);
      }
      if (SQUAT_URL_REGEX.test(u)) continue;
      const title = lm[2].replace(/<[^>]+>/g, "").trim();
      links.push({ url: u, title });
      if (links.length >= maxResults) break;
    }

    for (let i = 0; i < links.length; i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || "",
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

  while ((m = snippetRe.exec(html)) !== null && rawMatches.length < maxResults * 2) {
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
    if (SQUAT_URL_REGEX.test(cleanUrl)) continue;

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
    if (results.length >= maxResults) break;
  }

  return results;
}

async function searchDuckDuckGo(query: string, maxResults = 5): Promise<WebSearchResponse> {
  // 1. Önce NPM / PyPI paket sorgusu olup olmadığını kontrol et
  const pkgRes = await searchPackageRegistry(query).catch(() => null);

  // 2. DuckDuckGo HTML dene
  let htmlResults = await searchDuckDuckGoHtml(query, maxResults).catch(() => []);

  // 3. HTML boş dönerse DuckDuckGo Lite dene
  if (htmlResults.length === 0) {
    htmlResults = await searchDuckDuckGoLite(query, maxResults).catch(() => []);
  }

  const combinedResults: SearchResult[] = [];
  if (pkgRes) combinedResults.push(pkgRes);
  combinedResults.push(...htmlResults);

  if (combinedResults.length > 0) {
    return {
      query,
      backend: "duckduckgo",
      answer: pkgRes ? pkgRes.snippet : undefined,
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

  for (const topic of (data.RelatedTopics ?? [])) {
    if (topic.Text && topic.FirstURL) {
      if (SQUAT_URL_REGEX.test(topic.FirstURL)) continue;
      results.push({
        title: topic.Text.split(" - ")[0] ?? topic.Text.slice(0, 60),
        url: topic.FirstURL,
        snippet: topic.Text,
      });
      if (results.length >= maxResults) break;
    }
  }

  return {
    query,
    backend: "duckduckgo",
    answer: data.AbstractText || (pkgRes ? pkgRes.snippet : undefined),
    results: results.length > 0 ? results : (pkgRes ? [pkgRes] : []),
  };
}


// ─── Ana Fonksiyon ───────────────────────────────────────────────────────────

export async function webSearch(
  query: string,
  options: { maxResults?: number } = {}
): Promise<WebSearchResponse> {
  const { maxResults = 5 } = options;
  const tavilyKey = process.env.TAVILY_API_KEY ?? "";

  // Paket sorgusu varsa (Next.js, React, FastAPI vs.), her zaman önce resmi registry'den doğru sürümü al
  const pkgRes = await searchPackageRegistry(query).catch(() => null);

  if (tavilyKey.trim()) {
    try {
      const tavilyRes = await searchTavily(query, tavilyKey, maxResults);
      if (pkgRes) {
        tavilyRes.results = [pkgRes, ...tavilyRes.results.filter((r) => !SQUAT_URL_REGEX.test(r.url))].slice(0, maxResults);
        tavilyRes.answer = pkgRes.snippet + (tavilyRes.answer ? `\n\n${tavilyRes.answer}` : "");
      }
      return tavilyRes;
    } catch (err) {
      console.warn("[webSearch] Tavily başarısız, DuckDuckGo'ya geçiliyor:", err);
    }
  }

  try {
    return await searchDuckDuckGo(query, maxResults);
  } catch (err) {
    if (pkgRes) {
      return {
        query,
        backend: "duckduckgo",
        answer: pkgRes.snippet,
        results: [pkgRes],
      };
    }
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
