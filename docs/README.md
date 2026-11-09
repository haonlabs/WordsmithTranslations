# WordsmithTranslations

Chrome Extension untuk menerjemahkan pesan chat live Korea dan Jepang → Inggris pada YouTube Live Chat dan CHZZK. MVP menggunakan Chrome Built-in AI Translator API (client-side) sehingga tidak memerlukan backend atau Google Cloud API key.

## Product decisions

- Browser: Google Chrome dengan dukungan Chrome Built-in AI Translator API.
- Extension: Manifest V3.
- UI: React + Vite + TypeScript.
- Platforms: YouTube Live Chat dan CHZZK (`chzzk.naver.com`).
- Source languages: Korean (`ko`) and Japanese (`ja`).
- Target language: English (`en`).
- Mode: otomatis untuk semua pesan yang mengandung Hangul atau kana. Deteksi per pesan hanya lewat script: Hangul → `ko`, kana (hiragana/katakana) → `ja`; script yang lebih banyak menang pada pesan campuran.
- Model download: Chrome hanya mengizinkan satu pengunduhan model per klik pengguna, jadi tiap bahasa disiapkan dengan klik "Enable" sendiri di popup. Korea tetap berfungsi walau Jepang belum disiapkan.
- Rendering: pertahankan pesan asli; tambahkan terjemahan tepat di bawahnya.
- Translation: `Translator` API dari Chrome Built-in AI.
- No backend, no remote translation API, no API key.

## Important terminology

Ini bukan Chrome page-translation feature dan bukan public API untuk memanggil tombol “Translate this page”. Extension menggunakan **Chrome Built-in AI Translator API** untuk menerjemahkan string pesan individual.

## Documents

- `PROJECT_SPEC.md` — scope, requirements, UX, acceptance criteria.
- `ARCHITECTURE.md` — komponen, data flow, lifecycle, dan keputusan arsitektur.
- `TECH_STACK.md` — stack, dependency guidance, build/test.
- `IMPLEMENTATION_PLAN.md` — milestone dan urutan pengerjaan Claude Code.
- `CLAUDE.md` — instruksi kerja untuk Claude Code.
- `RISKS_AND_COMPATIBILITY.md` — kompatibilitas API, model availability, dan risiko platform.
- `TEST_PLAN.md` — test scenarios dan acceptance checklist.

## Suggested workflow

1. Baca `CLAUDE.md` dan seluruh dokumen spesifikasi.
2. Implementasikan skeleton extension dan validasi Translator API availability.
3. Selesaikan adapter YouTube terlebih dahulu.
4. Selesaikan adapter CHZZK setelah inspeksi DOM aktual.
5. Jalankan test dan verifikasi manual di Chrome yang memenuhi persyaratan API.

## Non-goals for MVP

- Audio/subtitle/video translation.
- Translating English → Korean/Japanese.
- Language auto-detection umum.
- Bahasa sumber/target lain selain `ko`/`ja` → `en`.
- Backend, database, accounts, analytics, or cloud sync.
- Guarantee support for every YouTube/CHZZK layout or future DOM change.
