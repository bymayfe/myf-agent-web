# MYF AI — Web Kokpit (Next.js 16 / TypeScript)

Python tabanlı `CLI_Project` (multi-agent yazılım geliştirme sistemi) projesinin
100% TypeScript full-stack yeniden yazımı. **Faz 1** tamamlandı: koordinatör
sohbeti, streaming, çoklu sağlayıcı desteği, oturum yönetimi.

## Kurulum

```bash
npm install
cp .env.example .env.local
# .env.local içine gerçek API anahtarlarını gir (NVIDIA_API_KEY, OPENROUTER_API_KEY, MOONSHOT_API_KEY)
```

## Çalıştırma

```bash
npm run dev     # geliştirme — http://localhost:3111
npm run build   # production build
npm run start   # production sunucu — http://localhost:3111
```

Port `package.json` içinde `-p 3111` olarak sabitlendi.

## Sağlayıcılar

- **Ollama** (lokal, key gerekmez) — varsayılan. `ollama serve` çalışıyor olmalı.
- **NVIDIA NIM**, **OpenRouter**, **Moonshot (Kimi K2)** — `.env.local`'den okunan API key gerekir.
- **LM Studio**, **llama.cpp** — lokal, key gerekmez.

Sağlayıcı/model değişimi arayüzdeki **Ayarlar → Sağlayıcı & Model** sekmesinden yapılır.

## Veri saklama

`data/` klasörü (settings.json, providers_config.json, sessions/*.json) proje
kökünde oluşur, **git'e eklenmez** (.gitignore'da). API anahtarları asla bu
klasöre yazılmaz — sadece `.env.local`'den okunur.

## 🚀 Çoklu Ajan Sıralı Pipeline Motoru & Python Entegrasyonu

Web arayüzü, 5 aşamalı otonom yazılım geliştirme pipeline'ını (**Architect → Developer → QA → Micro-Fix → Reviewer**) iki farklı modda çalıştırabilir:

1. **Python Çoklu-Ajan Motoru (Önerilen - Tam Otonom):**
   - Python tabanlı [`myf-agent-cli`](https://github.com/bymayfe/myf-agent-cli) sistemindeki `pipeline_bridge.py` köprüsü üzerinden gerçek test çalıştırıcı (`test_runner.py`), otomatik onarım döngüsü (`fix_engine.py`) ve AST sembol grafiğini kullanır.
   - **Kurulum:** Web projesi ile aynı üst klasöre `myf-agent-cli` deposunu klonlayın:
     ```bash
     cd ..
     git clone https://github.com/bymayfe/myf-agent-cli.git
     cd myf-agent-cli
     pip install -r agent_system/requirements.txt
     ```
   - **Beklenen Dizin Mimarisi:**
     ```text
     Projects/
     ├── myf-agent-web/       (Mevcut Web Arayüzü)
     └── myf-agent-cli/       (Python Motoru)
         └── agent_system/
             └── pipeline_bridge.py
     ```

2. **Dahili TypeScript Pipeline Motoru (Yedek Mod):**
   - Eğer Python motoru kurulu değilse sistem çökmez; Next.js içerisinde yerleşik TypeScript pipeline motoru devreye girer ve aşamaları arayüzde canlı SSE akışıyla yürütür.

## Faz durumu

| Faz | Kapsam | Durum |
|---|---|---|
| 1 | Coordinator chat, streaming, ayarlar, oturumlar | Tamamlandı |
| 2 | Sıralı pipeline (PM, Mimar, Dev, QA, Reviewer) | Tamamlandı (Python Bridge + TS Fallback) |
| 3 | Diff engine (surgical edit) + test runner | Tamamlandı |
| 4 | Subagent / swarm orkestrasyonu + codebase memory graph | Tamamlandı |

## Mimari notları

- `src/lib/llmClient.ts` — Ollama NDJSON streaming + OpenAI-uyumlu SSE, tek arayüz.
- `src/lib/coordinator.ts` — sistem promptu, onay/iptal kısa-devre tespiti, pipeline marker.
- `src/lib/store.ts` — dosya tabanlı JSON kalıcılık (settings/providers/sessions).
- `src/app/api/pipeline/route.ts` — Python `pipeline_bridge.py` canlı SSE bağlantısı ve TS fallback motoru.
- `src/app/api/*` — Next.js Route Handler'lar, `runtime = "nodejs"` (fs erişimi için).
- UI: `ThinkBlock` (düşünme paneli), `CodeBlock` (Shiki syntax highlight), glassmorphism tema.
