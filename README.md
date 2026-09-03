# 🌐 MYF AI Agent Web UI & Cockpit

> **Antigravity & Claude Code Tarzı Otonom Ajan Mühendisliği Web Kokpiti**  
> Next.js 16, React 19, TypeScript ve Tailwind CSS ile inşa edilmiş; çift kanallı SSE streaming, canlı terminal entegrasyonu, gerçek zamanlı dosya düzenleme ve görselleştirme sunan profesyonel geliştirici arayüzü.

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Temel Özellikler

### 1. 📡 Sıfır Gecikmeli Canlı Akış & Düşünce Süreci (Zero-Lag Streaming)
- **Canlı ve Otomatik Açılan Düşünme Blokları:** Model düşünürken mor düşünce kutusu (`<think>`) canlı olarak otomatik açılır, içeriğiyle birlikte en alta yumuşakça kayar (`auto-scroll`); düşünme bitince kendiliğinden toparlanıp şık bir rozet halini alır.
- **Harf Harf Akış Garantisi:** Değişmez (immutable) React state mimarisi ve tamponsuz (unbuffered) HTTP SSE başlıkları ile her bir harf ve token anında ekrana yansır.
- **Canlı Araç Çağrısı Kartları:** Dosya yazma (`write_file`), terminal komutu çalıştırma (`run_terminal`) ve web araması (`web_search`) kartlar halinde anlık olarak işlenir.

### 2. 🛡️ Otonom Eylem & Lafta Kalmayı Önleme Motoru (Anti-Empty-Promise)
- **Akıllı Komut Niyet Kurtarma (`Heuristic Recovery`):** Model JSON araç bloğu üretmeyip metin içerisinde *"şimdi `npx tsc --noEmit` ile kontrol ediyorum"* dediğinde, komut anında yakalanıp gerçek bir `run_command` terminal görevine dönüştürülür.
- **Otomatik Yönlendirme ve Uyarı (Auto-Steering):** Model eylem vaat edip araç çağırmadığında, arka planda gizli sistem uyarısıyla anında çeki düzen verilir.
- **Kesintisiz Devam (Seamless Continue):** Sadece model token limitine ulaştığında çıkan ve tıklandığında anında temizlenen şık devam barı ("✕" tek tıkla kapatma seçeneğiyle).

### 3. 🖥️ Entegre Arka Plan Terminali & Görev Yöneticisi
- Uzun süren derleme ve sunucu süreçlerini (`npm run dev`, `cargo build` vb.) arka planda canlı izleme.
- Sekme kapatılsa veya sayfa yenilense dahi terminal çıktıları kaybolmaz; API üzerinden sürekli okunabilir.
- Tek tıkla görev iptali (`kill`) ve durum denetimi.

### 4. 📁 Proje Bazlı İzolasyon & Akıllı Oturum Yönetimi
- **Proje Klasörü Bağlama:** Bilgisayarınızdaki herhangi bir proje klasörünü bağlayıp üzerinde çalıştırabilirsiniz.
- **Akıllı Oturum Sıfırlama:** Bir projedeki oturum silindiğinde ekran doğrudan o projenin sıfır ekranına geçer; bağımsız oturum silindiğinde genel sohbete döner.
- **Git Diff & Değiştirilen Dosyalar Kartı:** Tur boyunca düzenlenen ve oluşturulan tüm dosyaları özet kartında listeler.

---

## 🛠️ Kurulum ve Çalıştırma

### 1. Gereksinimler
- Node.js 18.18+ (Node.js 20+ önerilir)
- npm, yarn veya pnpm
- Arka planda çalışan bir LLM sağlayıcısı ([Ollama](https://ollama.com), llama.cpp veya Cloud API)

### 2. Kurulum

```bash
# Repoyu klonlayın
git clone https://github.com/bymayfe/myf-agent-web.git
cd myf-agent-web

# Bağımlılıkları yükleyin
npm install

# Çevre değişkenleri şablonunu oluşturun (opsiyonel)
cp .env.example .env.local
```

### 3. Geliştirici Sunucusunu Başlatma

```bash
npm run dev
```

Tarayıcınızda [http://localhost:3111](http://localhost:3111) adresini açın.

---

## 🔌 RESTful API Mimarisi

Tüm API uç noktaları tam RESTful prensiplere ve `Cache-Control: no-store, no-cache, must-revalidate` önbellek korumasına sahiptir:

| Metot | Uç Nokta | Durum Kodu | Açıklama |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/chat` | `200 Stream` | SSE tabanlı çift kanallı ajan sohbet ve araç yürütme |
| `GET` | `/api/sessions` | `200 OK` | Kayıtlı tüm oturumların meta verilerini listeler |
| `POST` | `/api/sessions` | `201 Created` | Yeni bir oturum başlatır (opsiyonel `project_dir` ile) |
| `GET` | `/api/sessions/:id` | `200 OK` | Belirli bir oturumun tam mesaj geçmişini çeker |
| `PATCH`| `/api/sessions/:id` | `200 OK` | Oturum geçmişini günceller (Geri al / Undo) |
| `DELETE`| `/api/sessions/:id` | `200 OK` | Oturumu diskten ve bellekten kalıcı olarak siler |
| `GET` | `/api/projects` | `200 OK` | Kayıtlı projeleri listeler |
| `POST` | `/api/projects` | `201 Created` | Yeni proje klasörü bağlar |
| `DELETE`| `/api/projects` | `200 OK` | Proje bağlantısını kaldırır (opsiyonel dosya silme ile) |
| `GET` | `/api/models` | `200 OK` | Canlı GPU/VRAM ve mevcut LLM modellerini tarar |
| `GET` | `/api/settings` | `200 OK` | Sistem ve sağlayıcı ayarlarını getirir |
| `POST` | `/api/settings` | `200 OK` | Model ve sağlayıcı ayarlarını günceller |

---

## 📄 Lisans

Bu proje **MIT** lisansı altında yayınlanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsiniz.
