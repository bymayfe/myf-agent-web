# 📝 Değişiklik Günlüğü (Changelog)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir. Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına uygundur.

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
