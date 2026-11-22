# Kitobim — kitobxon kundaligi

Sayt va telefon ilovasi (PWA). Bitta akkaunt bilan saytdan ham, ilovadan ham kiriladi.

- `index.html` — sayt/ilova
- `manifest.webmanifest`, `sw.js`, `icons/` — telefonga o'rnatish va offline ishlash
- `Code.gs` — Google Sheets server (GitHub'da kerak emas, Apps Script'ga joylanadi)
- `server/KitobimAI.gs` — admin paneldagi AI yordamchi (Apps Script'ga alohida fayl qilib qo'shiladi)

## AI yordamchi (admin panel → Kutubxona → kitob qo'shish)

PDF yuklanganda AI kitobni o'qiydi va **nom, muallif, janr, betlar soni, tavsif, muqova va kitob mag'zi**ni o'zi to'ldiradi.
"Ovozlashtirish" tugmasi mag'zini **Nevra.uz** ovozida audioga aylantiradi. Hammasi tayyor bo'lgach, **"Kitobni nashr etish"** tugmasi chiqadi.

Muqova: PDF'ning 1-sahifasi rasmli muqova bo'lsa, o'sha olinadi → bo'lmasa internetdan (Google Books, Open Library) qidiriladi → topilmasa Kitobim uslubida yaratiladi.

### Ulash (bir marta)
1. Apps Script → "+" → Script → nomi `KitobimAI` → `server/KitobimAI.gs` ni to'liq joylang.
2. `Code.gs` → `function doPost(e) {` dan keyingi birinchi qator: `var ai = kitobimAI_(e); if (ai) return ai;`
3. Project Settings → Script Properties: `GEMINI_API_KEY` (AI Studio kaliti) va `NEVRA_URL` (nevra.uz → "Claude'ga ulash" sahifasidagi manzil).
4. `kitobimAITest` ni ▶ Run qiling, ruxsat bering — log'da hammasi ✓ bo'lsin.
5. Deploy → Manage deployments → ✏️ → New version → Deploy.
