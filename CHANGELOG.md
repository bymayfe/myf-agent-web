# 📝 Değişiklik Günlüğü (Changelog)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir. Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına uygundur.

---

## [1.11.0] - 2026-09-20

### ⚡ Yerel Model (llama.cpp / Ollama) Durum Tespiti & Akıllı Timer
- **Yerel Model Tespiti & Durum Bildirimleri (`route.ts`):**
  - Sağlayıcı `api_base` adresinin yerel (`localhost`, `127.0.0.1`, `8080`, `11434`, `1234`) veya `llama_cpp`, `ollama`, `lm_studio` olup olmadığı tespit edildi.
  - Yerel modellerde yanıltıcı olan "Bulut sağlayıcı kuyruğu yoğun" ve "Cold-Start" mesajları engellendi; yerine `🧠 Yerel model promptu işliyor...` ve `⚡ Yerel model yanıtı hazırlıyor...` anlık durum güncellemeleri entegre edildi.

## [1.10.0] - 2026-09-20

### 🛡️ Kısır Döngü Kırıcı (Hard Loop Breaker), Expo/Metro Algılama & Alt Klasör Dosya Yönlendirme
- **Sert Döngü Kırıcı (Hard Loop Breaker) (`route.ts`):**
  - Modelin aynı araç ve parametre kombinasyonunu art arda çağırması durumunda, 2. tekrarda araç çalıştırması engellenerek otonom döngü anında kırıldı (`break`).
  - İlk tekrarda modele Türkçe sonuç üretmesi için zorunlu uyarı yönergesi enjekte edildi.
- **Expo, React Native ve Vite Canlı Sunucu Tespiti (`terminalManager.ts`):**
  - `expo start`, `npx expo start`, `react-native start`, `vite` komutları dev server listesine eklendi.
  - Metro Bundler hazır sinyalleri (`Metro is running`, `Logs for your project will appear`, vb.) algılandığında portu kilitlemeden test sürecini başarıyla sonlandıran otomatik mekanizma devreye alındı.
- **Akıllı Alt Proje Dosya Yönlendiricisi (`route.ts`):**
  - Scaffolding komutları (örn. `npx create-expo-app`) ile açılan alt klasörlerdeki `package.json` yapısı otomatik algılanarak, modelin ürettiği `App.tsx` ve `src/...` kodlarının kök yerine doğru alt proje klasörüne kaydedilmesi sağlandı.
- **Pipeline Promptlarının İngilizceye Taşınması (`pipelineRunner.ts`):**
  - Mimar ve Geliştirici aşamalarında LLM'e iletilen iç promptlar ve kurallar İngilizceye uyarlandı, UI olayları Türkçe tutuldu.

## [1.9.0] - 2026-09-20

### 🌐 Sistem Promptlarının İngilizceye Taşınması & Türkçe Çıktı Kuralı
- **LLM Sistem Promptları ve Mod Tanımları İngilizceye Çevrildi (`coordinator.ts`):**
  - Qwen2.5-Coder gibi kodlama modellerinin kurallara eksiksiz uyması ve token verimliliği için tüm kural maddeleri (Kural 1-9) İngilizceye dönüştürüldü.
- **Zorunlu Türkçe İletişim (OUTPUT LANGUAGE):**
  - Promptun 6. kuralı olarak modelin kullanıcıya daima akıcı Türkçe ile hitap etmesi, kod blokları ve tool call JSON bloklarının İngilizce kalması kuralı eklendi.
- **Eklentiler ve Araç Dokümantasyonları (`src/lib/plugins/`):**
  - `pluginManager.ts` ve 8 yerleşik eklentinin (`git`, `fs`, `codebase`, `codebaseMemory`, `web`, `terminal`, `patch`, `testRunner`) tüm sistem açıklamaları ve araç parametreleri İngilizceye uyarlandı.
- **Döngü Kırıcı Rehberler ve Formatlayıcılar (`route.ts`, `codebaseMap.ts`, `webSearch.ts`):**
  - Ajanın çok adımlı döngüsünde modele geri beslenen yönlendirme yönergeleri ile kod haritası formatlayıcısı İngilizceye taşındı.

## [1.8.0] - 2026-09-20

### 🛡️ Sistem Promptu Mod Entegrasyonu & TypeScript Tip Güvenliği
- **Çalışma Modunun LLM Sistem Promptuna Entegrasyonu (`coordinator.ts`):**
  - Ayarlar panelinde seçilen çalışma modunun (`sequential`, `subagent`, `interactive`) `buildAgentListBlock` aracılığıyla sistem promptuna dinamik olarak enjekte edilmesi sağlandı; model hangi modda çalıştığını doğrudan bilir.
- **TypeScript Tip Güvenliği & React Kuralları:**
  - `ProviderConfig` ve `ModelOption` arayüzlerine `available_models` ve `context_window` alanları eklenerek `tsc --noEmit` sıfır hatayla derlendi.
  - `ThinkBlock.tsx` içerisindeki saf olmayan `Date.now()` çağrısı `useRef(0)` ile güvenli hale getirildi.
  - `coordinator.ts` içindeki kullanılmayan eski onay kelime listeleri temizlendi.

## [1.7.0] - 2026-09-18

### 🤖 Yeni Yerel GGUF Modelleri & llama.cpp Dinamik Model Desteği (Web UI)

#### `defaultProviders.ts` — `llama_cpp` Provider Güncellendi
- `available_models` bölümü eklendi: 6 GGUF model (ad, boyut, context window, açıklama)
- `model_context_windows` tüm 6 modelle güncellendi; `Huihui-Qwen3.8-27B` için `16384` (VRAM koruması), diğerleri `32768`
- `agent_models` boş `"openai/"` değerlerinden tam `"openai/default"` değerlerine güncellendi

#### `api/models/route.ts` — Zengin Model Listesi
- `available_models` alanı varsa öncelikli olarak kullanılır: model adı + boyut + açıklama ile zengin label üretilir
- Fallback olarak `model_context_windows` kullanılır; `"default"` gibi meta key'ler artık filtreleniyor

#### Yeni GGUF Modelleri (llama.cpp ile kullanılabilir)
- **Qwen2.5-Coder-7B-Instruct-abliterated-Q5_K_M** (5.1 GB) — Yüksek kaliteli Q5_K_M sansürsüz kodlama
- **Qwen2.5-Coder-14B-Instruct-abliterated-IQ3_M** (6.5 GB) — Büyük 14B sansürsüz kodlama
- **Huihui-Qwen3.8-27B-abliterated-UD-DW-Q4_K_M** (15.4 GB) — En güçlü lokal model, 27B sansürsüz

## [1.6.0] - 2026-09-18

### ⚡ F5 ve Yenilemede Kesintisiz Arka Plan Süreci (SessionExecutionManager) & Canlı Re-Attach
- **Arka Planda Kesintisiz Yürütme (`SessionExecutionManager`):**
  - Tarayıcıda F5'e basıldığında veya sekme yenilendiğinde HTTP bağlantısının kopması (`req.signal.abort`) artık sunucudaki LLM ve araç döngüsünü durdurmaz.
  - `sessionExecutionManager` singleton mimarisi devreye alındı; LLM çıkarımları, düşünce adımları, dosya yazımları ve araç çalıştırmaları sunucu tarafında bağımsız bir arka plan süreci olarak akışına devam eder.
- **Canlı Yeniden Bağlanma (Live Re-Attach) & SSE Olay Tamponu (Event Buffer):**
  - Sunucuda üretilen tüm SSE olayları (`content`, `thinking`, `status`, `activity`, `file_changes`, `terminal_task` vb.) oturum bazlı tamponlanır.
  - Sayfa yenilendiğinde veya oturuma geri dönüldüğünde istemci `GET /api/chat?sessionId=...&action=status` ile canlı süreci algılar ve `action=attach` ile canlı akışa kaldığı yerden bağlanır; kayıp olmadan canlı yanıt akmaya devam eder.
- **Gerçek Zamanlı Adım Kalıcılığı (`persistTurn`):**
  - Çok adımlı araç döngüsünde her araç çağrısının hemen ardından oturum geçmişi diske (`data/sessions/<id>.json`) anlık kaydedilir; elektrik kesilse veya sekme kapansa dahi ara adımlar korunur.
- **Kazara Yenileme Koruması (`beforeunload` Tarayıcı Uyarısı):**
  - Canlı akış sürerken veya çalışan terminal görevleri varken kullanıcının yanlışlıkla sayfayı yenilemesini veya sekmeyi kapatmasını önleyen tarayıcı onay diyaloğu eklendi.

### 🐛 Maximum Update Depth Exceeded (Sonsuz Re-Render Döngüsü) Düzeltmesi
- **Hook Referans Kararlılığı (`useCoordinatorChat`):**
  - `options` parametresi `optionsRef` ile sarmalanarak `attachToLiveSession`, `sendMessage` ve `loadHistory` fonksiyonlarının her render'da yeniden üretilip bağımlılık zincirini tetiklemesi önlendi.
- **Tekil İlk Yükleme Koruması (`page.tsx`):**
  - `chatOptions` nesnesi `useMemo` ile stabilize edildi; başlangıç ayar ve oturum geri yükleme `useEffect`'i `initialLoadDone` bayrağı ile tek sefere kilitlendi.
- **Ayarlar Modalı Koruması (`SettingsModal.tsx`):**
  - Modal kapalıyken arka plandaki ayar değişikliklerinin `setDraft` tetikleyerek React render sınırını aşması (`if (!open) return`) engellendi.

### 🛡️ Terminal Sekmesi Kapatma Kalıcılığı & Çalışan İşlem Uyarı Modalı
- **Kapatılan Sekmelerin Yeniden Açılması Sorunu Giderildi:**
  - `removeTerminalTask` çalıştırıldığında görevin yalnızca yerel React state'ten değil, `sessionStore.current` içindeki tüm oturum önbelleklerinden ve sunucu tarafındaki `TerminalManager` görev havuzundan temizlenmesi sağlandı.
  - `dismissedTaskIds` listesi `localStorage` (`myf_dismissed_terminal_tasks`) üzerinde kalıcı kılındı; sayfa yenilense veya canlı SSE akışı sürse dahi kapatılan görevlerin tekrar açılması engellendi.
  - `TerminalManager` singleton örneği (`globalThis.terminalManager`) modül yeniden yüklemelerinde sıfırlanmayacak şekilde korundu.
  - ANSI renk kodları (`stripAnsi`) temizlenerek port tespitinin kusursuz çalışması sağlandı; bir görev silindiğinde o porta bağlı arka plan süreçleri ve dev sunucuları anında temizlenir.
- **Çalışan İşlem Kapatma Uyarı Modalı (`TerminalPanel.tsx`):**
  - Aktif çalışan bir terminal görevi (`status === "running"`) kapatılmak istendiğinde kazara veri/işlem kaybını önlemek için onay diyaloğu eklendi.
  - Kullanıcıya işlemin sonlandırılacağı ve portun serbest bırakılacağı açıkça bildirilir; "İşlemi Sonlandır ve Kapat" veya "Vazgeç" seçenekleri sunulur.

### 🧪 Kokpit Geliştirme Ortamı İzolasyonu (Turbopack & Dev Server Sızıntı Koruması)
- **Alt Projelere `TURBOPACK` ve `__NEXT_DEV_SERVER` Sızıntısı Engellendi:**
  - Web UI (Kokpit) Next.js geliştirme modunda çalışırken `process.env` üzerinde oluşan `TURBOPACK`, `__NEXT_DEV_SERVER`, `NEXT_RUNTIME` ve `NEXT_PRIVATE_*` ortam değişkenlerinin alt projelerdeki shell/terminal komutlarına (`childEnv`) sızması engellendi.
  - Alt projelerdeki `npm run build` komutlarının çakışma yaşamadan tamamen saf ve bağımsız bir ortamda derlenmesi sağlandı.

## [1.5.0] - 2026-09-18

### 🛑 Terminal Görev Sekmelerinin Kesin Kapatılması & Portların Serbest Bırakılması
- **Kapatılan Sekmelerin Geri Gelmesi Engellendi:**
  - Kapatılan (`X`) veya silinen terminal görevlerinin periyodik arka plan taraması (`scanRunningDevServers`) sebebiyle hemen tekrar ekrana gelmesi sorunu kökten giderildi.
  - `dismissedTaskIds`, `dismissedPids` ve `dismissedPorts` dışlama setleri oluşturularak arka plan taramalarının kapatılan görevleri diriltmesi engellendi.
  - `useCoordinatorChat.ts` içerisine `dismissedTaskIdsRef` eklenerek yerel React state ile backend anket senkronizasyonu arasındaki yarış durumları (race-condition) önlendi.
- **Port ve Süreç Ağacı Temizliği (`fuser` & Recursive `pgrep`):**
  - Görev sonlandırıldığında veya sekme silindiğinde dinleyen portlar `fuser -k -9 <port>/tcp` ile anında serbest bırakılır.
  - `killProcessTree` fonksiyonu özyinelemeli `pgrep -P` ile alt süreçleri (Next.js, Vite, npm, node worker'ları) hiyerarşik olarak toplayıp SIGKILL fallback ile temizler; askıda kalan zombi süreç ve sonsuz döngü hissi tamamen ortadan kaldırıldı.

### 📜 Akıllı Otomatik Kaydırma & Yüzen "Yeni İleti ↓" Butonu
- **Zorunlu Aşağı Çekme (Aggressive Auto-Scroll) Kaldırıldı:**
  - Mesaj akarken veya düşünce adımları üretilirken kullanıcının yukarı kaydırıp önceki düşünceleri/kodları okumasını engelleyen agresif otomatik kaydırma iptal edildi.
  - Mesaj konteyneri kaydırma konumu dinamik takip edilir; kullanıcı en alttan yukarıdaysa ekran konumu sabit kalır.
- **Yüzen "Yeni İleti ↓" Butonu:**
  - Kullanıcı yukarıdayken yeni bir yanıt veya akış geldiğinde mesaj alanının üzerinde dikkat çekici ve şık bir **"Yeni İleti ↓"** butonu (animasyonlu) belirir.
  - Kullanıcı sadece geçmişi incelerken ise **"Aşağı Kaydır ↓"** butonu sunulur.
  - Butona tıklandığında veya kullanıcı yeni bir mesaj gönderdiğinde akıcı bir şekilde en alta inilir.

### 🤝 Nezaket / Teşekkür ("eyw", "sağol", "teşekkürler") Algılama & Sıfır Araç Döngüsü
- **Kısa Devre Nezaket Yanıtı (`preEvaluateUserInput`):**
  - Kullanıcı "eyw", "eyvallah", "teşekkürler", "sağol", "eline sağlık", "harika", "tamamdır" gibi teşekkür veya memnuniyet iletisi yazdığında ajanın gereksiz yere 14 adımlık test/derleme (`npm run build`, `npm run dev`) döngüsüne girmesi engellendi.
  - Konuşma durumuna göre sıfır gecikmeyle ve token harcamadan projenin hazır olduğunu teyit eden nezaket cevabı dönülür.
- **Koordinatör Sistem Promptu Kuralı (Kural 8):**
  - Koordinatör sistem promptuna teşekkür/onay durumlarında tekrar derleme veya dosya okuma araçlarını çağırmama kuralı eklendi.

## [1.4.0] - 2026-09-18

### 🧠 Çok Aşamalı Düşünme Pencereleri ("Düşünce 1, 2, 3...") & Evrensel Sağlayıcı Uyumluluğu
- **Adımlı ve Ayrık Düşünme Blokları:**
  - Çok turlu araç döngüsünde (`MAX_TOOL_ITERATIONS`) her akıl yürütme aşaması artık tek bir kutuya yığılmak yerine sırasıyla numaralandırılmış bağımsız paneller halinde sunulur (`Düşünce 1`, `Düşünce 2`, `Düşünce 3`...).
  - Sürekli aynı düşünme kutusuna metin ekleme (birikme) sorunu giderildi; her düşünce bloğu ilgili araç çağrısının ve eyleminin hemen öncesinde kronolojik olarak gösterilir.
  - Canlı düşünme esnasında `Düşünce 1 düşünüyor... (2.1s)` sayacı ve son satır önizlemesi her blok için bağımsız çalışır; tamamlandığında satır ve süre bilgisi kilitlenir.
  - Her düşünce kartı birbirinden bağımsız açılıp kapatılabilir (`İncele` / `Gizle`) ve kendi paneline özel `Kopyala` butonuna sahiptir.
- **Sıfır Hata & Evrensel Sağlayıcı (Universal Provider) Desteği:**
  - Ollama (DeepSeek-R1, Qwen reasoning vb.), DeepSeek API, OpenAI (o1/o3), OpenRouter, Moonshot (Kimi), Anthropic ve yerel llama.cpp modelleriyle tam uyumlu.
  - Akıl yürütme (reasoning) yeteneği olmayan modeller (GPT-4o, Claude 3.5 Sonnet standart, Llama 3) kullanıldığında sistem hiçbir hata vermez; düşünme blokları oluşturulmadan standart metin ve araç akışı pürüzsüz çalışır.
  - Ollama stream katmanına inline `<think>` fallback ayrıştırıcısı eklendi.
- **Geçmiş Arındırma (Context Sanitization):**
  - Çok adımlı döngüde LLM'e geri beslenen asistan geçmişinden `<think>` blokları arındırıldı (`cleanTurnForLlm`). Modelin geçmiş düşünceleri görerek kilitlenmesi veya token israfı yapması engellendi.
  - Oturum kaydedilirken (`history`) ve oturum tekrar yüklendiğinde düşünce bloklarının kronolojik sırası eksiksiz korunur.

### 🖥️ Canlı Terminal: Açık Dev Sunucularını Devralma & Süreç Ağacı Sonlandırma
- **Arka Plandaki Dev Sunucularının Otomatik Keşfi (Orphan Adoption):**
  - Linux `ss -tlpn` socket denetimiyle sistemde arka planda açık kalmış veya web UI dışından başlatılmış dev sunucuları (`npm run dev`, `vite`, `python -m http.server`) taranır; ilgili portlar (örn: 3000, 3001, 3002) otomatik olarak terminal yöneticisine devralınarak bağlanır.
- **Kapsamlı Süreç Ağacı Sonlandırma (`killProcessTree`):**
  - Next.js ve Vite gibi alt süreç (worker thread/subprocess) doğuran dev sunucularını `pkill -P` ve `SIGTERM` / `SIGKILL` ile hiyerarşik olarak temizleyen mekanizma eklendi; portların askıda kalması ve zombi süreçler tamamen engellendi.
- **Terminal Yönetim UI & Sekme Kapatma:**
  - Terminal paneline çalışan komutları tek tıkla sonlandıran **"Durdur"** butonu ve sekmeleri kapatma (**"X"**) butonu eklendi.
  - Yeni REST API endpoint'leri: `/api/terminal/tasks`, `/api/terminal/tasks/[id]`, `/api/terminal/tasks/[id]/kill`.

### 🛡️ Göz Yormayan Sabit Canlı Port Rozeti (Titreşim ve Yanıp Sönme Kaldırıldı)
- **Sadeleştirilmiş Arayüz (Minimal UI):**
  - Mesaj kutusunun üzerinde sürekli yanıp sönen (`animate-ping`) genel işlem çubuğu kaldırıldı.
  - Yalnızca aktif dinleyen portlar olduğunda zarif ve titreşimsiz sabit bir **"Canlı Port: :3000 [X]"** göstergesi sunuldu.
  - Port rozeti üzerinden çalışan dev server tek tıkla durdurulabilir veya tarayıcıda doğrudan açılabilir.
  - `useCoordinatorChat` anket mekanizması optimize edildi, gereksiz React yeniden render'ları engellendi.

## [1.3.0] - 2026-09-17

### 📦 Web Arama Registry Doğrulama & Squat Koruması
- **Resmi Paket ve Sürüm Düzeltmesi (0.0.3 Fix):**
  - NPM kayıt defterinde terk edilmiş `nextjs: 0.0.3` gibi paketlerin `web_search` sonuçlarında gerçek Next.js (16.3.5) yerine geçmesi engellendi.
  - `SQUAT_URL_REGEX` ile kukla paket URL'leri DuckDuckGo HTML ve Lite sonuçlarından temizlendi.
  - `searchPackageRegistry` fonksiyonu ile `nextjs`, `reactjs`, `vuejs`, `tailwindcss`, `nestjs` vb. aliaslar çözülür ve PyPI (`fastapi`, `pydantic` vb.) desteği sağlandı.

### 🛡️ Ajan Döngüsü, Port İzolasyonu & Halüsinasyon Önleme
- **14 Adımlı Ajan Kapasitesi:** `MAX_TOOL_ITERATIONS` sınırı 8'den **14'e** çıkarıldı; ajanın dosya okuma ve test aşamalarında erken durması önlendi.
- **Tarafsız Sentez ve Halüsinasyon Yasağı:** Limit dolduğunda modeli zorla *"hata ara ve açıkla"* moduna sokan dil kaldırıldı; derleme/test başarılıysa projenin çalıştığını açıkça bildirme ve hayali hata uydurmama kuralı getirildi.
- **Bağlam ve Port İzolasyonu:** Web UI'ın 3111 portunun `child_process.spawn` ile alt projelere sızması (`delete childEnv.PORT`) engellendi; `hayditest` gibi projelerin varsayılan 3000 portunda temiz açılması sağlandı.
- **Dev Server Yaşam Döngüsü:** `terminalPlugin.ts` dev server doğrulandığında açık ve net mesaj dönecek şekilde güncellendi; sistem promptuna `timeout` gerekmediği bilgisi eklendi.
- **Akıllı Test Stratejisi:** Projedeki tüm dosyaları tek tek okumak yerine doğrudan derleme/test (`npm run build`) önceliği sistem promptuna kural olarak yerleştirildi.
- **Dengeli Ayraç JSON Ayrıştırıcı:** `extractBalancedJsonObjects` ile iç içe JSON araç çağrıları ve parametreler kırpılmadan tam olarak ayıklanır.

## [1.2.0] - 2026-09-17

### ⏱️ Evrensel Cold-Start & Bulut Gecikme İzleyicisi
- **Canlı Durum ve Süre Sayacı:**
  - `route.ts` üzerinde modelden ilk token gelene kadar geçen süreyi takip eden sayaç eklendi (`⏳ Sağlayıcıya bağlanıldı (6s)...`, `🚀 Model uyandırılıyor / Cold-Start bekleniyor (14s)...`).
  - `MessageBubble.tsx` içinde ilk token gelene kadar statik "Working" yerine canlı sayaçlı rozet gösterimi sağlandı. İlk token geldiğinde rozet otomatik olarak temizlenir.

### 🛡️ Katı Bulut API & Akıl Yürütme (Reasoning) Uyumluluğu
- **Kimi-K3 & OpenAI Uyumluluğu:**
  - `llmClient.ts` içindeki sabit `repeat_penalty`, `presence_penalty` ve `frequency_penalty` parametreleri kaldırıldı.
  - Kimi-K3 ve akıl yürütme modellerinin `presence_penalty is immutable and must be 0` hatasıyla 400 Bad Request dönmesi engellendi.
  - `top_k` parametresi katı REST API'lerin hata vermemesi için opsiyonel hale getirildi.

### ⚡ Canlı Akış (Streaming) ve Oturum Senkronizasyon Onarımı
- **React State Referans Senkronizasyonu (`useCoordinatorChat.ts`):**
  - Akış sırasında doğrudan dizi ve nesne mutasyonu nedeniyle React'in re-render yapmaması ve ekranın "Working"de takılı kalması sorunu, mesaj dizisi ve nesneleri klonlanarak (`[...state.messages.map(m => ({ ...m }))]`) tamamen çözüldü.
  - `session_created` anında aktif oturum referansı hemen güncellenir hale getirildi.
- **Temiz Araç Çağrısı Fallback:**
  - `ToolCallBlock.tsx` içindeki kırılgan regex blokları kaldırılarak temiz fallback sağlandı.
  - `chat/route.ts` içindeki inline HTML temizleme zinciri bağımsız `stripHtml()` fonksiyonuna taşındı.

## [1.1.0] - 2026-09-04

### ⚡ Canlı Akış, Düşünce Motoru ve Otonom Komut İyileştirmeleri

#### 🧠 Gerçek Zamanlı Canlı Düşünce & Akış (Zero-Lag Streaming)
- **Harf Harf Canlı Akış:** React 19'un aynı dizi referansı nedeniyle re-render'ı ertelemesi (bail-out) engellendi; her gelen düşünce ve metin token'ında değişmez (immutable) state güncellenerek ekranın anlık akması sağlandı.
- **Canlı Açılan Düşünce Bloğu (`ThinkBlock`):** Model düşünürken mor düşünce kutusu artık otomatik olarak açık geliyor ve gelen token'larla en alta kayıyor (`auto-scroll`); düşünme bitip cevaba geçildiğinde kendiliğinden toparlanıyor.
- **Tamponsuz HTTP Taşıma:** `route.ts` API yanıtlarına `X-Accel-Buffering: no` ve `Cache-Control: no-cache, no-transform` eklenerek ara katman tamponlaması sıfırlandı.

#### 🛡️ Eylem Kurtarma ve Lafta Kalmayı Önleme Motoru (Anti-Empty-Promise Engine)
- **Akıllı Komut Niyet Kurtarma (`Heuristic Intent Recovery`):** Model JSON araç bloğu üretmeyip sadece metin içerisinde *"Tamam, şimdi `npx tsc --noEmit` ile kontrol yapıyorum..."* dediğinde, komut anında yakalanıp otomatik gerçek bir `run_command` terminal görevine dönüştürülüyor.
- **Otomatik Yönlendirme (Auto-Steering):** Model komut adı da vermeden sadece *"Tamam! Başlatıyorum..."* deyip durursa, sistem turu kesmeden arka planda modele derhal yönlendirici uyarı göndererek araç çağırmasını sağlıyor.
- **Sertleştirilmiş Sistem Promptu:** Modele eylem cümlelerinin hemen altında araç çağırma zorunluluğu getirildi; kuru vaatler kesin olarak yasaklandı.

#### 🎯 Kesintisiz Devam (Continue) Barı Düzeltmesi
- Kullanıcı [Devam Et] butonuna bastığında alertin ekranda asılı kalması giderildi; `sessionStore` üzerinde kalıcı temizlik sağlandı.
- İstemeyen kullanıcılar için tek tıkla kapatma sağlayan şık bir **"✕" (Dismiss)** butonu eklendi.

---

## [1.0.0] - 2026-09-03

### 🎉 İlk Kararlı Sürüm (Initial Public Release)

#### 🚀 Yeni Özellikler
- **Antigravity / Claude Code Tarzı Çift Kanallı Web Arayüzü:**
  - Next.js 16 + React 19 mimarisi ile modern, koyu tema camgöbeği/lacivert kokpit.
  - Server-Sent Events (SSE) ile canlı düşünme (`<think>`) ve içerik ayrıştırma.
- **Canlı Araç Yürütme ve Kart Bileşenleri:**
  - `write_file`: Canlı kod yazma ve otomatik JSON onarımı (`repairAndParseJson`).
  - `run_terminal`: Gerçek zamanlı terminal görevleri ve arka plan process takibi.
  - `web_search`: Genişletilebilir ve daraltılabilir arama sonuç kartları.
- **Kesintisiz Devam (Seamless Continuation) ve Gerçek Kesinti Tespiti:**
  - Yalnızca model token/bağlam sınırına takıldığında (`finish_reason === "length"`) tetiklenen akıllı bildirim barı.
  - Baştan başlama veya giriş cümlesi tekrarlarını önleyen kaldığı yerden tamamlama motoru.
- **Canlı Bağlam & Token Göstergesi (`Ctx: %XX`):**
  - Üst başlıkta anlık token kullanım yüzdesini ve renk kodlamalı uyarıları yansıtan sayaç.
- **Hızlı Eylem Çipleri (Quick Action Chips):**
  - Mesaj sonlarında `[⚡ Projeyi Çalıştır]` ve `[📁 Dosyaları Listele]` tek tıkla aksiyon butonları.
- **Proje Bazlı Oturum Yönetimi & Akıllı Sıfırlama:**
  - Proje klasörlerini bağlama ve oturumları projeye izole etme.
  - Oturum silindiğinde projeyi unutmadan doğrudan proje sıfır ekranına geçiş.
- **Tam RESTful ve Önbellek Korumalı API Katmanı:**
  - Tüm dinamik GET rotalarında `force-dynamic` ve `Cache-Control: no-store` başlıkları.
