# 📝 Değişiklik Günlüğü (Changelog)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir. Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına uygundur.

---

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
