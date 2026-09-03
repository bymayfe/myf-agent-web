# 📝 Değişiklik Günlüğü (Changelog)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenmektedir. Format [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına uygundur.

---

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
