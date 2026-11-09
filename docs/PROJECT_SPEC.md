# Product & Project Specification

## 1. Overview

**Product name:** WordsmithTranslations  
**Type:** Chrome Extension (Manifest V3)  
**Primary use case:** Membaca live chat Korea dan Jepang dengan terjemahan Inggris yang muncul inline di bawah pesan asli.

## 2. Goals

1. Mendeteksi pesan chat baru yang muncul secara dinamis.
2. Menerjemahkan pesan Korea dan Jepang ke Inggris secara otomatis.
3. Menampilkan hasil terjemahan tepat di bawah pesan sumber.
4. Mempertahankan tampilan dan interaksi pesan asli.
5. Berjalan tanpa backend dan tanpa API key eksternal.

## 3. Target platforms

### YouTube
- Domain utama: `www.youtube.com`.
- Cakupan MVP: live chat pada halaman live dan pop-out chat jika dapat diakses oleh content script.
- YouTube dapat menggunakan iframe, Polymer/custom elements, dan DOM yang berubah. Implementasi harus menginspeksi struktur aktual; jangan mengasumsikan satu selector berlaku untuk semua layout.
- Perhatikan konfigurasi iframe dan `all_frames` hanya bila dibutuhkan dan telah diuji.

### CHZZK
- Domain: `chzzk.naver.com`.
- Cakupan MVP: chat pada halaman live yang dapat diakses content script.
- Struktur DOM dan rendering dapat berubah. Buat adapter terpisah dan selector configuration yang mudah diperbarui.

## 4. Language behavior

- Source languages: Korean (`ko`) dan Japanese (`ja`). Target tetap English (`en`).
- Tidak menjalankan general-purpose language detection. Deteksi per pesan hanya lewat script: Hangul → `ko`, kana (hiragana/katakana) → `ja`; script yang lebih banyak menang pada pesan campuran.
- Proses pesan jika mengandung setidaknya satu karakter Hangul atau kana yang relevan.
- Pesan campuran Korea/Inggris dan Jepang/Inggris tetap diterjemahkan.
- Pesan Jepang yang hanya berisi kanji (mis. "草") dilewati karena tidak bisa dibedakan dari Mandarin.
- Pesan yang hanya berisi Inggris, angka, URL, atau emoji dilewati.
- Jangan mengubah atau menghapus pesan asli.
- Jika Translator API/model tidak tersedia, tampilkan status yang jelas pada extension UI; jangan diam-diam fallback ke layanan eksternal.

## 5. User experience

### Inline result
Contoh:

Original: `안녕하세요 오늘 방송 재밌어요!`  
Translation: `Hello, today's stream is fun!`

Persyaratan:
- Terjemahan muncul tepat di bawah teks pesan sumber.
- Style ringan dan konsisten dengan konteks chat.
- Terjemahan punya penanda visual kecil seperti `EN`.
- Jangan mengubah username, badges, timestamp, emotes, atau tombol aksi.
- Jangan mengubah urutan pesan dan jangan memaksa scroll.
- Pesan sumber tetap utuh.

### Controls
MVP minimum:
- Popup React dengan status API/model: Available / Downloading / Unavailable / Error.
- Toggle enable/disable.
- Pilihan default enabled.
- Tombol retry/check availability bila model belum tersedia.
- Target bahasa tetap English untuk MVP.

## 6. Functional requirements

- FR-01: Extension hanya aktif pada host YouTube dan CHZZK yang ditetapkan.
- FR-02: Platform adapter mengidentifikasi elemen pesan chat.
- FR-03: MutationObserver mendeteksi pesan baru dan perubahan subtree yang relevan.
- FR-04: Pesan Korea atau Jepang baru masuk ke translation queue.
- FR-05: Queue mencegah request bersamaan berlebihan dan menjaga UI tetap responsif.
- FR-06: Pesan identik tidak diterjemahkan berulang kali selama cache masih berlaku.
- FR-07: Translation API dipanggil dengan `sourceLanguage` hasil deteksi script (`"ko"` atau `"ja"`) dan `targetLanguage: "en"`.
- FR-08: Hasil ditampilkan sebagai elemen extension-owned di bawah pesan asli.
- FR-09: Elemen terjemahan tidak boleh diproses kembali oleh observer.
- FR-10: Kegagalan terjemahan tidak menghapus atau merusak pesan asli.
- FR-11: SPA navigation / perubahan live room harus menginisialisasi adapter dengan benar dan membersihkan observer lama.
- FR-12: Pengaturan enable/disable disimpan melalui `chrome.storage.local`.
- FR-13: API/model availability diperiksa sebelum memproses antrean.
- FR-14: Tidak ada request translation ke backend atau layanan eksternal pada MVP.

## 7. Non-functional requirements

- NFR-01: Tidak memblokir main thread dengan pekerjaan berat.
- NFR-02: Tidak menambahkan duplikasi terjemahan pada pesan yang sama.
- NFR-03: Queue memiliki concurrency limit dan batas panjang.
- NFR-04: Cache dibatasi ukurannya dan memiliki eviction policy.
- NFR-05: Observer menggunakan konfigurasi sekecil mungkin untuk menghindari overhead.
- NFR-06: Tidak mengumpulkan atau mengirim isi chat ke server pihak ketiga.
- NFR-07: Semua DOM mutation harus aman dan idempotent.
- NFR-08: Komponen extension mudah diuji tanpa bergantung pada website live.

## 8. Out of scope

- Menerjemahkan audio, subtitle, judul, deskripsi, atau video.
- Terjemahan dua arah.
- Terjemahan ke Indonesia.
- Bahasa sumber lain selain Korean dan Japanese.
- Akun pengguna, backend, database, analytics, telemetry.
- Dukungan semua situs streaming.
- Jaminan kualitas setara Google Cloud Translation.

## 9. Acceptance criteria

MVP dianggap selesai jika:
1. Extension dapat di-load melalui Chrome `chrome://extensions` sebagai unpacked extension.
2. Popup menampilkan status dukungan Translator API.
3. Pada halaman YouTube Live Chat yang didukung, pesan Hangul atau kana baru mendapatkan terjemahan Inggris di bawah pesan asli.
4. Pada halaman CHZZK yang didukung, perilaku yang sama berjalan.
5. Pesan yang bukan Korea/Jepang tidak diterjemahkan; termasuk pesan Jepang yang hanya berisi kanji (mis. "草").
6. Pesan campuran Korea/Inggris dan Jepang/Inggris diproses.
7. Pesan yang sama tidak menghasilkan beberapa terjemahan.
8. Terjemahan tidak memicu loop MutationObserver.
9. Chat tetap bisa discroll dan digunakan.
10. Jika API/model tidak tersedia atau gagal, pesan asli tetap utuh dan UI memberi indikasi kegagalan.
11. Tidak ada backend, API key, atau request ke translation service eksternal.
