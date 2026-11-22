# Kitobim — kitobxon kundaligi

Sayt va telefon ilovasi (PWA). Bitta akkaunt bilan saytdan ham, ilovadan ham kiriladi.

- `index.html` — sayt/ilova
- `manifest.webmanifest`, `sw.js`, `icons/` — telefonga o'rnatish va offline ishlash
- `Code.gs` — Google Sheets server (GitHub'da kerak emas, Apps Script'ga joylanadi)

## AI yordamchi (admin panel → Kutubxona → kitob qo'shish)

PDF yuklanganda AI kitobni o'qiydi va **nom, muallif, janr, betlar soni, tavsif, muqova va kitob mag'zi**ni o'zi to'ldiradi.
"Ovozlashtirish" tugmasi mag'zini **Nevra.uz** ovozida audioga aylantiradi. Hammasi tayyor bo'lgach, **"Kitobni nashr etish"** tugmasi chiqadi.

Muqova: PDF'ning 1-sahifasi rasmli muqova bo'lsa, o'sha olinadi → bo'lmasa internetdan (Google Books, Open Library) qidiriladi → topilmasa Kitobim uslubida yaratiladi.

### Sozlash
AI qismi Code.gs ichida. Script Properties: `ADMIN_KEY` (admin panel paroli), `GEMINI_API_KEY`, `NEVRA_URL`.
Tekshirish: Apps Script'da `kitobimAITest` ni ▶ Run qiling, keyin Deploy → Manage deployments → ✏️ → New version → Deploy.
