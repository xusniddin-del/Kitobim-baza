/**
 * Kitobim — AI yordamchi (Gemini + Nevra.uz)
 * ------------------------------------------------------------
 * Admin paneldagi "AI bilan to'ldirish" va "Ovozlashtirish" tugmalari shu fayl orqali ishlaydi:
 *   aiBook  — PDF'ni Gemini'ga beradi: nom, muallif, janr, tavsif, kitob mag'zi
 *   aiCover — muqovani internetdan qidiradi (Google Books, Open Library) va Drive'ga saqlaydi
 *   aiVoice — matn bo'lagini Nevra.uz orqali ovozga aylantiradi (WAV)
 *
 * O'RNATISH (bir marta, ~3 daqiqa):
 *  1) Apps Script → Fayllar yonidagi "+" → Script → nomi: KitobimAI → shu faylni to'liq joylang → Saqlang.
 *  2) Code.gs → function doPost(e) { qatoridan keyin, birinchi qator qilib qo'shing:
 *         var ai = kitobimAI_(e); if (ai) return ai;
 *  3) ⚙️ Project Settings → Script Properties → Add script property:
 *         GEMINI_API_KEY = Google AI Studio kaliti (Nevra'dagi kalitning o'zi bo'lsa ham bo'ladi)
 *         NEVRA_URL      = nevra.uz → Kabinet → "Claude'ga ulash" sahifasidagi shaxsiy manzil
 *  4) Yuqoridagi ro'yxatdan kitobimAITest ni tanlab ▶ Run → ruxsat bering → Execution log'da hammasi ✓ bo'lsin.
 *  5) Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 */

var KAI = {
  MODELS: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  VOICES: ['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'],
  STYLE: 'warm, calm and engaging audiobook narrator, clear Uzbek pronunciation',
  MAX_TTS: 1200,
  API: 'https://generativelanguage.googleapis.com'
};

/* Code.gs dagi doPost boshida chaqiriladi. AI so'rovi bo'lmasa null qaytaradi. */
function kitobimAI_(e) {
  kaiCore_();
  var req = null;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || 'null'); } catch (x) { return null; }
  var fn = req && { aiBook: kaiBook_, aiCover: kaiCover_, aiVoice: kaiVoice_ }[req.action];
  if (!fn) return null;
  var out;
  try {
    if (!kaiAdmin_(req.key)) throw kaiErr_("Admin kaliti noto'g'ri");
    out = fn(req) || {}; out.ok = true;
  } catch (err) {
    console.error(err && err.stack || err);
    out = { ok: false, error: (err && err.userMessage) || ('AI xatosi: ' + (err && err.message || err)) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* Yangi yadro (kitob mag'zi maydonlari bilan) — Code.gs dagi eski nusxa o'rniga ishlaydi */
function kaiCore_() { try { KitobimCore = KitobimCoreAI_; return true; } catch (x) { return false; } }

function kaiErr_(m) { var e = new Error(m); e.userMessage = m; return e; }
function kaiProp_(k, msg) { var v = String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); if (!v && msg) throw kaiErr_(msg); return v; }
function kaiAdmin_(k) {
  var a = '';
  try { a = ADMIN_KEY; } catch (x) {}
  if (!a) a = kaiProp_('ADMIN_KEY');
  return !!a && String(k || '') === String(a);
}
function kaiHeader_(resp, name) { var h = resp.getAllHeaders(); for (var k in h) if (k.toLowerCase() === name) return Array.isArray(h[k]) ? h[k][0] : h[k]; return ''; }
function kaiMsg_(raw) { try { var j = JSON.parse(raw); return (j.error && (j.error.message || j.error.status)) || raw; } catch (x) { return String(raw || '').slice(0, 200); } }

/* ===================== 1) Kitobni o'qish (Gemini) ===================== */
function kaiBook_(req) {
  var key = kaiProp_('GEMINI_API_KEY', "Script Properties'ga GEMINI_API_KEY qo'shing (aistudio.google.com dagi kalit)");
  var blob = kaiPdfBlob_(req.file), up = kaiUpload_(blob, key);
  try {
    var genres = (Array.isArray(req.genres) ? req.genres : []).join(', ');
    var prompt = [
      "Sen Kitobim onlayn kutubxonasining muharririsan. Ilova qilingan PDF — kitob. Uni boshidan oxirigacha diqqat bilan ko'rib chiq.",
      "Faqat bitta JSON obyekt qaytar, boshqa hech narsa yozma:",
      '{"title": "", "author": "", "genre": "", "pages": 0, "desc": "", "summary": "", "firstPageIsCover": false, "isbn": "", "lang": ""}',
      "",
      "title — kitob nomi, muqova yoki titul sahifasida qanday yozilgan bo'lsa shunday (lotin yozuvida bo'lsa lotinda).",
      "author — muallif ism-familiyasi. Tarjima kitob bo'lsa asl muallif. Noma'lum bo'lsa bo'sh qoldir.",
      "genre — faqat shu ro'yxatdan bittasi: " + genres + ".",
      "pages — PDF dagi sahifalar soni.",
      "desc — 2–3 gapdan iborat qisqa tavsif (350 belgigacha): kitob nima haqida va kimga foydali.",
      "summary — KITOB MAG'ZI. Talablar:",
      "  • o'zbek tilida, lotin yozuvida (kitob qaysi tilda bo'lishidan qat'i nazar);",
      "  • 2500–4000 belgi, 5–8 xatboshi, xatboshilar orasida bo'sh qator;",
      "  • ovoz chiqarib o'qish uchun yoziladi: markdown, yulduzcha, ro'yxat belgisi, sarlavha va emoji ishlatma, faqat oddiy gaplar;",
      "  • tuzilishi: kitob nima haqida va asosiy g'oyasi → eng muhim fikrlar yoki voqealar (badiiy asarda syujetning asosiy chizig'i va qahramonlar) → amaliy saboqlar → xulosa: bu kitob kimga va nima uchun kerak;",
      "  • faqat kitobda bor narsani yoz, o'zingdan to'qima.",
      "firstPageIsCover — PDF'ning 1-sahifasi rasmli yoki dizaynli muqova bo'lsa true; oddiy matn, titul yoki oq sahifa bo'lsa false.",
      "isbn — kitobda ISBN bo'lsa faqat raqamlari, bo'lmasa bo'sh.",
      "lang — kitob tili kodi (uz, ru, en, tr ...).",
      "Desc va summary'dagi o' va g' harflari uchun oddiy apostrof (') ishlat."
    ].join('\n');
    var r = kaiGen_(key, [{ file_data: { mime_type: up.mimeType || 'application/pdf', file_uri: up.uri } }, { text: prompt }], { responseMimeType: 'application/json' });
    var b = kaiJson_(r.text), s = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n); };
    return { model: r.model, book: {
      title: s(b.title, 160), author: s(b.author, 120), genre: s(b.genre, 40), pages: parseInt(b.pages, 10) || 0, desc: s(b.desc, 600),
      summary: s(b.summary, 20000).replace(/\*\*|__|^#+\s*/gm, '').replace(/^\s*[-•*]\s+/gm, ''),
      firstPageIsCover: b.firstPageIsCover === true || b.firstPageIsCover === 'true', isbn: s(b.isbn, 20).replace(/[^0-9Xx]/g, ''), lang: s(b.lang, 8) } };
  } finally {
    try { UrlFetchApp.fetch(KAI.API + '/v1beta/' + up.name, { method: 'delete', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }); } catch (x) {}
  }
}

function kaiPdfBlob_(f) {
  f = f || {};
  if (f.id) {
    try { return DriveApp.getFileById(String(f.id)).getBlob(); }
    catch (x) { throw kaiErr_("PDF'ni Drive'dan ochib bo'lmadi. Fayl shu Google akkauntda ekanini yoki \"Havolaga ega hamma\" uchun ochiqligini tekshiring"); }
  }
  if (/^https?:\/\//.test(f.url || '')) {
    var r = UrlFetchApp.fetch(f.url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) throw kaiErr_("PDF havolasini yuklab bo'lmadi (" + r.getResponseCode() + ')');
    return r.getBlob();
  }
  throw kaiErr_('PDF topilmadi');
}

/* Gemini File API: katta PDF'lar uchun (20 MB dan ortig'i ham) */
function kaiUpload_(blob, key) {
  var bytes = blob.getBytes(), mime = 'application/pdf';
  var start = UrlFetchApp.fetch(KAI.API + '/upload/v1beta/files', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': mime },
    payload: JSON.stringify({ file: { display_name: 'kitobim-' + Date.now() } })
  });
  var url = kaiHeader_(start, 'x-goog-upload-url');
  if (start.getResponseCode() === 400 || start.getResponseCode() === 403) throw kaiErr_('Gemini kaliti ishlamadi: ' + kaiMsg_(start.getContentText()));
  if (!url) throw kaiErr_("PDF'ni AI'ga yuborib bo'lmadi (" + start.getResponseCode() + '): ' + kaiMsg_(start.getContentText()));
  var up = UrlFetchApp.fetch(url, { method: 'post', contentType: mime, muteHttpExceptions: true,
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, payload: bytes });
  var f = (JSON.parse(up.getContentText() || '{}') || {}).file;
  if (!f || !f.uri) throw kaiErr_("PDF AI'ga yuklanmadi: " + kaiMsg_(up.getContentText()));
  for (var i = 0; i < 40 && f.state === 'PROCESSING'; i++) {
    Utilities.sleep(2500);
    f = JSON.parse(UrlFetchApp.fetch(KAI.API + '/v1beta/' + f.name, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }).getContentText());
  }
  if (f.state === 'FAILED') throw kaiErr_("AI bu PDF'ni o'qiy olmadi (fayl buzilgan yoki himoyalangan bo'lishi mumkin)");
  return f;
}

function kaiModels_() {
  var own = kaiProp_('GEMINI_MODELS');
  return own ? own.split(/[\s,]+/).filter(String) : KAI.MODELS;
}

function kaiGen_(key, parts, gen) {
  var cache = CacheService.getScriptCache(), list = kaiModels_(), last = '';
  list = list.filter(function (m) { return !cache.get('kaibusy' + m); }).concat(list.filter(function (m) { return cache.get('kaibusy' + m); }));
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    var resp = UrlFetchApp.fetch(KAI.API + '/v1beta/models/' + m + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: gen || {} })
    });
    var code = resp.getResponseCode(), raw = resp.getContentText();
    if (code === 200) {
      var j = JSON.parse(raw), c = j.candidates && j.candidates[0];
      var t = c && c.content && (c.content.parts || []).map(function (p) { return p.thought ? '' : (p.text || ''); }).join('');
      if (t) return { text: t, model: m };
      last = m + ': bo\'sh javob (' + ((c && c.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || '?') + ')';
      continue;
    }
    last = m + ' ' + code + ': ' + kaiMsg_(raw);
    if (code === 401 || code === 403) throw kaiErr_("Gemini kaliti noto'g'ri yoki ruxsati yo'q: " + kaiMsg_(raw));
    if (code === 404) cache.put('kaibusy' + m, '1', 21600);
    if (code === 429 || code >= 500) cache.put('kaibusy' + m, '1', code === 429 ? 300 : 60);
  }
  if (/429/.test(last)) throw kaiErr_("Gemini limiti vaqtincha tugagan. 1–2 daqiqadan keyin qayta urinib ko'ring");
  throw kaiErr_('AI javob bermadi — ' + last);
}

function kaiJson_(t) {
  t = String(t || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch (x) {}
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (x) {} }
  throw kaiErr_("AI javobini tushunib bo'lmadi. Qayta urinib ko'ring");
}

/* ===================== 2) Muqovani internetdan topish ===================== */
function kaiCover_(req) {
  var title = String(req.title || '').trim(), author = String(req.author || '').trim(), isbn = String(req.isbn || '').replace(/[^0-9Xx]/g, '');
  if (!title && !isbn) throw kaiErr_('Kitob nomi kerak');
  var found = null;
  try { found = kaiGoogleBooks_(title, author, isbn); } catch (x) { console.error(x); }
  if (!found) { try { found = kaiOpenLib_(title, author, isbn); } catch (x) { console.error(x); } }
  if (!found) return { file: null };
  var file = kaiSave_(found.blob.setName(kaiSlug_(title || isbn) + '-muqova.jpg'));
  return { file: file, source: found.source };
}

function kaiNorm_(s) {
  return String(s || '').toLowerCase().replace(/[‘’ʻʼ`´']/g, '').replace(/[^a-zа-яёўқғҳ0-9\s]/gi, ' ').split(/\s+/).filter(function (w) { return w.length > 1; });
}
function kaiTitleOk_(want, got) {
  var a = kaiNorm_(want), b = kaiNorm_(got); if (!a.length || !b.length) return false;
  var hit = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
  return hit / a.length >= 0.6 && hit / b.length >= 0.4;
}
function kaiAuthorOk_(want, list) {
  if (!want) return true; if (!list || !list.length) return false;
  var a = kaiNorm_(want), b = kaiNorm_(list.join(' '));
  return a.some(function (w) { return w.length > 2 && b.indexOf(w) >= 0; });
}
function kaiImg_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return null;
  var b = r.getBlob(), ct = String(kaiHeader_(r, 'content-type') || b.getContentType() || '');
  if (!/image\/(jpe?g|png|webp)/i.test(ct) || b.getBytes().length < 6000) return null;
  return b;
}
function kaiGoogleBooks_(title, author, isbn) {
  var q = isbn ? 'isbn:' + isbn : 'intitle:' + title + (author ? '+inauthor:' + author : '');
  var k = kaiProp_('BOOKS_API_KEY');
  var r = UrlFetchApp.fetch('https://www.googleapis.com/books/v1/volumes?maxResults=8&printType=books&q=' + encodeURIComponent(q).replace(/%2B/g, '+') + (k ? '&key=' + k : ''), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var items = JSON.parse(r.getContentText()).items || [];
  for (var i = 0; i < items.length; i++) {
    var v = items[i].volumeInfo || {}, im = v.imageLinks || {};
    var src = im.extraLarge || im.large || im.medium || im.thumbnail || im.smallThumbnail;
    if (!src) continue;
    if (!isbn && !(kaiTitleOk_(title, v.title + ' ' + (v.subtitle || '')) && kaiAuthorOk_(author, v.authors))) continue;
    src = src.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
    var b = kaiImg_(src + (/books\/content/.test(src) ? '&fife=w800' : '')) || kaiImg_(src);
    if (b) return { blob: b, source: 'Google Books' };
  }
  return null;
}
function kaiOpenLib_(title, author, isbn) {
  if (isbn) { var bi = kaiImg_('https://covers.openlibrary.org/b/isbn/' + isbn + '-L.jpg?default=false'); if (bi) return { blob: bi, source: 'Open Library' }; }
  if (!title) return null;
  var r = UrlFetchApp.fetch('https://openlibrary.org/search.json?limit=8&fields=title,author_name,cover_i&title=' + encodeURIComponent(title) + (author ? '&author=' + encodeURIComponent(author) : ''), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var docs = JSON.parse(r.getContentText()).docs || [];
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i]; if (!d.cover_i || !kaiTitleOk_(title, d.title) || !kaiAuthorOk_(author, d.author_name)) continue;
    var b = kaiImg_('https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg?default=false');
    if (b) return { blob: b, source: 'Open Library' };
  }
  return null;
}

function kaiFolder_() {
  try { if (typeof folder_ === 'function') return folder_(); } catch (x) {}
  var it = DriveApp.getFoldersByName('Kitobim kutubxona');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Kitobim kutubxona');
}
function kaiSave_(blob) {
  var f = kaiFolder_().createFile(blob);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
  return { id: f.getId(), name: f.getName(), size: f.getSize(), mime: f.getMimeType() };
}
function kaiSlug_(s) { return String(s || 'kitob').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kitob'; }

/* ===================== 3) Ovozlashtirish (Nevra.uz) ===================== */
function kaiNevra_(method, params) {
  var url = kaiProp_('NEVRA_URL', "Script Properties'ga NEVRA_URL qo'shing (nevra.uz → Kabinet → \"Claude'ga ulash\" sahifasidagi manzil)");
  var resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    headers: { Accept: 'application/json, text/event-stream' },
    payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params || {} }) });
  var raw = resp.getContentText(), code = resp.getResponseCode();
  if (code !== 200) throw kaiErr_('Nevra javob bermadi (' + code + '). NEVRA_URL to\'g\'riligini tekshiring');
  var j = null;
  try { j = JSON.parse(raw); } catch (x) {
    var data = raw.split('\n').filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).trim(); });
    for (var i = data.length - 1; i >= 0 && !j; i--) { try { j = JSON.parse(data[i]); } catch (y) {} }
  }
  if (!j) throw kaiErr_('Nevra javobini tushunib bo\'lmadi');
  if (Array.isArray(j)) j = j[0];
  if (j.error) throw kaiErr_('Nevra: ' + (j.error.message || 'xato'));
  return j.result || {};
}

function kaiVoice_(req) {
  var text = String(req.text || '').trim();
  if (!text) throw kaiErr_("Matn bo'sh");
  if (text.length > KAI.MAX_TTS) throw kaiErr_('Bir bo\'lak ' + KAI.MAX_TTS + ' belgigacha bo\'lishi kerak');
  var voice = KAI.VOICES.indexOf(req.voice) >= 0 ? req.voice : 'Charon';
  var res = kaiNevra_('tools/call', { name: 'generate_speech', arguments: { text: text, voice: voice, style: KAI.STYLE, name: 'kitobim-magzi' } });
  var msg = ((res.content || [])[0] || {}).text || '';
  if (res.isError) throw kaiErr_('Nevra: ' + msg);
  var info; try { info = JSON.parse(msg); } catch (x) { throw kaiErr_('Nevra: ' + msg.slice(0, 200)); }
  if (!info.raw_url) throw kaiErr_('Nevra audio havolasini qaytarmadi');
  for (var i = 0; i < 6; i++) {
    var r = UrlFetchApp.fetch(info.raw_url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() === 200) {
      var bytes = r.getContent();
      if (bytes.length > 1000) return { audio: Utilities.base64Encode(bytes), mime: 'audio/wav', seconds: info.seconds || 0 };
    }
    Utilities.sleep(2000);
  }
  throw kaiErr_("Nevra audioni tayyorladi, lekin uni yuklab bo'lmadi. Qayta urinib ko'ring");
}

/* ===================== Tekshiruv: muharrirda ▶ Run ===================== */
function kitobimAITest() {
  var P = PropertiesService.getScriptProperties(), ok = function (b) { return b ? '✓' : '✗'; };
  Logger.log('Admin kaliti topildi: ' + ok((function () { try { return !!ADMIN_KEY; } catch (x) { return !!P.getProperty('ADMIN_KEY'); } })()));
  Logger.log('Yangi yadro (kitob mag\'zi saqlanadi): ' + ok(kaiCore_()));
  var key = P.getProperty('GEMINI_API_KEY');
  Logger.log('GEMINI_API_KEY: ' + ok(key));
  if (key) { try { var g = kaiGen_(key, [{ text: 'Faqat "ok" deb javob ber.' }], {}); Logger.log('Gemini ishlayapti ✓ (' + g.model + ')'); } catch (e) { Logger.log('Gemini ✗ ' + (e.userMessage || e.message)); } }
  Logger.log('NEVRA_URL: ' + ok(P.getProperty('NEVRA_URL')));
  if (P.getProperty('NEVRA_URL')) { try { var t = kaiNevra_('tools/list', {}); Logger.log('Nevra ulandi ✓ (' + ((t.tools || []).length) + ' ta asbob)'); } catch (e) { Logger.log('Nevra ✗ ' + (e.userMessage || e.message)); } }
  try { Logger.log('Drive papka ✓ ' + kaiFolder_().getName()); } catch (e) { Logger.log('Drive ✗ ' + e.message); }
  Logger.log("Tayyor bo'lsa: Deploy → Manage deployments → ✏️ → Version: New version → Deploy");
}

/* ===================== Kitobim yadrosi (index.html dagi bilan bir xil) ===================== */
var KitobimCoreAI_ = (function () {
  var TABLES = ["users", "books", "posts", "follows", "media", "library"];
  var MILESTONES = [[1, 10], [3, 30], [7, 70], [14, 150], [30, 300], [60, 600], [100, 1000], [365, 5000]];

  function now() { return new Date().toISOString(); }
  function rid(n) { var c = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; for (var i = 0; i < (n || 12); i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  function normPhone(p) { var d = String(p || "").replace(/\D/g, ""); if (d.length === 9) d = "998" + d; return d; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim().slice(0, max || 200); }
  function bkey(t, a) { return (clean(t).toLowerCase() + "|" + clean(a).toLowerCase()).replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " "); }
  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fail(m) { var e = new Error(m); e.userMessage = m; throw e; }
  function int(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }

  /* ---------- hisob-kitob ---------- */
  function dayMap(books) {
    var m = {};
    books.forEach(function (b) { (b.sessions || []).forEach(function (s) { m[s.d] = (m[s.d] || 0) + Math.max(0, (s.to || 0) - (s.from || 0)); }); });
    return m;
  }
  function streakOf(m, today) { var n = 0, d = today; if (!m[d]) d = addDays(d, -1); while (m[d]) { n++; d = addDays(d, -1); } return n; }
  function bestStreak(m) {
    var days = Object.keys(m).filter(function (k) { return m[k] > 0; }).sort(), best = 0, cur = 0, prev = null;
    days.forEach(function (d) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; });
    return best;
  }
  function pagesRead(b) { return b.status === "done" ? int(b.pages) : b.status === "reading" ? int(b.current) : 0; }
  function stats(db, uid, today) {
    var bs = db.books.filter(function (b) { return b.userId === uid; });
    var m = dayMap(bs), week = 0, i;
    for (i = 0; i < 7; i++) week += m[addDays(today, -i)] || 0;
    var done = bs.filter(function (b) { return b.status === "done"; }).length;
    var pages = bs.reduce(function (a, b) { return a + pagesRead(b); }, 0);
    var posts = db.posts.filter(function (p) { return p.userId === uid; }).length;
    var best = bestStreak(m), bonus = 0;
    MILESTONES.forEach(function (ms) { if (best >= ms[0]) bonus += ms[1]; });
    var vals = Object.keys(m).map(function (k) { return m[k]; }).filter(function (v) { return v > 0; });
    var reading = bs.filter(function (b) { return b.status === "reading"; });
    return {
      done: done, reading: reading.length, plan: bs.filter(function (b) { return b.status === "plan"; }).length,
      pages: pages, week: week, today: m[today] || 0, streak: streakOf(m, today), best: best, posts: posts,
      record: vals.length ? Math.max.apply(null, vals) : 0, avg: vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0,
      ball: pages + done * 50 + posts * 5 + bonus, days: m,
      current: reading.map(function (b) { return { title: b.title, current: int(b.current), pages: int(b.pages) }; })
    };
  }

  /* ---------- foydalanuvchi ko'rinishlari ---------- */
  function counts(db, uid) {
    return { followers: db.follows.filter(function (f) { return f.b === uid; }).length, following: db.follows.filter(function (f) { return f.a === uid; }).length };
  }
  function pub(db, u, today) {
    if (!u) return { id: "", name: "O'chirilgan", username: "" };
    var c = counts(db, u.id), st = stats(db, u.id, today);
    return { id: u.id, name: u.name, username: u.username, bio: u.bio || "", createdAt: u.createdAt, lastActive: u.lastActive,
      private: !!u.private, followers: c.followers, following: c.following,
      ball: st.ball, done: st.done, pages: st.pages, week: st.week, streak: st.streak, color: u.color || 0, avatar: u.avatar || "" };
  }
  function self(db, u, today) {
    var p = pub(db, u, today);
    p.phone = u.phone; p.mustChange = !!u.mustChange; p.goal = u.goal || 20; p.region = u.region || ""; p.age = u.age || ""; p.gender = u.gender || ""; p.job = u.job || "";
    return {
      user: p, stats: stats(db, u.id, today),
      books: db.books.filter(function (b) { return b.userId === u.id; }),
      following: db.follows.filter(function (f) { return f.a === u.id; }).map(function (f) { return f.b; })
    };
  }
  function publicBook(b) {
    return { id: b.id, key: bkey(b.title, b.author), title: b.title, author: b.author, genre: b.genre || "", pages: b.pages, current: b.current,
      status: b.status, start: b.start, end: b.end, rating: b.rating || 0, recBy: b.recBy || "", gift: !!b.gift, giftFrom: b.giftFrom || "",
      experience: b.experience || "", recTo: b.recTo || "", updated: b.updated };
  }
  function postView(db, p, meId, today) {
    var u = db.users.filter(function (x) { return x.id === p.userId; })[0];
    var readers = p.bookKey ? db.books.filter(function (b) { return bkey(b.title, b.author) === p.bookKey; }).length : 0;
    return { id: p.id, user: pub(db, u, today), text: p.text, createdAt: p.createdAt, rating: p.rating || 0,
      book: p.bookKey ? { key: p.bookKey, title: p.bookTitle, author: p.bookAuthor, readers: readers } : null,
      likes: (p.likes || []).length, liked: (p.likes || []).indexOf(meId) >= 0, views: p.views || 0,
      comments: (p.comments || []).map(function (c) { var cu = db.users.filter(function (x) { return x.id === c.userId; })[0];
        return { id: c.id, text: c.text, createdAt: c.createdAt, user: cu ? { id: cu.id, name: cu.name, username: cu.username, color: cu.color || 0, avatar: cu.avatar || "" } : { name: "?" } }; }) };
  }
  function libView(L) {
    return { id: L.id, key: bkey(L.title, L.author), title: L.title, author: L.author, genre: L.genre || "", pages: int(L.pages), desc: L.desc || "", summary: L.summary || "", summaryAudio: L.summaryAudio || null,
      cover: L.cover || null, pdf: L.pdf || null, audio: L.audio || [], published: !!L.published, createdAt: L.createdAt, updated: L.updated };
  }
  function cleanFile(f) {
    if (!f) return null; var o = { id: clean(f.id, 120).replace(/[^A-Za-z0-9_-]/g, ""), url: /^data:image\//.test(String(f.url || "")) ? String(f.url).slice(0, 500000) : clean(f.url, 2000), name: clean(f.name, 160), size: int(f.size), mime: clean(f.mime, 80) };
    if (o.url && !/^(https?:|blob:|data:)/.test(o.url)) o.url = "";
    return o.id || o.url ? o : null;
  }
  function aggregate(db) {
    var map = {};
    db.books.forEach(function (b) {
      var k = bkey(b.title, b.author); if (!map[k]) map[k] = { key: k, title: b.title, author: b.author, genre: b.genre || "", pages: int(b.pages), readers: 0, readingNow: 0, done: 0, plan: 0, rsum: 0, rcnt: 0, users: [] };
      var a = map[k]; a.readers++; a.users.push(b.userId);
      if (!a.genre && b.genre) a.genre = b.genre; if (!a.pages && b.pages) a.pages = int(b.pages);
      if (b.status === "reading") a.readingNow++; if (b.status === "done") a.done++; if (b.status === "plan") a.plan++;
      if (b.rating) { a.rsum += b.rating; a.rcnt++; }
    });
    db.posts.forEach(function (p) { if (p.bookKey && map[p.bookKey] && p.rating) { map[p.bookKey].rsum += p.rating; map[p.bookKey].rcnt++; } });
    (db.library || []).forEach(function (L) {
      if (!L.published) return; var k = bkey(L.title, L.author);
      if (!map[k]) map[k] = { key: k, title: L.title, author: L.author, genre: L.genre || "", pages: int(L.pages), readers: 0, readingNow: 0, done: 0, plan: 0, rsum: 0, rcnt: 0, users: [] };
      map[k].lib = libView(L); if (!map[k].genre) map[k].genre = L.genre || ""; if (!map[k].pages) map[k].pages = int(L.pages);
    });
    return Object.keys(map).map(function (k) { var a = map[k]; a.rating = a.rcnt ? Math.round(a.rsum / a.rcnt * 10) / 10 : 0; delete a.rsum; return a; });
  }

  /* ---------- amallar ---------- */
  function me(db, req) {
    var u = db.users.filter(function (x) { return x.token && x.token === req.token; })[0];
    if (!u) fail("Iltimos, akkauntingizga qayta kiring");
    u.lastActive = now();
    return u;
  }
  var H = {
    register: function (db, r) {
      var phone = normPhone(r.phone), name = clean(r.name, 60);
      if (phone.length < 12) fail("Telefon raqamni to'liq kiriting");
      if (name.length < 2) fail("Ism-familiyangizni yozing");
      if (!r.pass || String(r.pass).length < 20) fail("Parol noto'g'ri");
      if (db.users.some(function (x) { return x.phone === phone; })) fail("Bu raqam allaqachon ro'yxatdan o'tgan. Kirish bo'limidan foydalaning");
      var base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "kitobxon", un = base, i = 1;
      while (db.users.some(function (x) { return x.username === un; })) un = base + (++i);
      var u = { id: rid(10), phone: phone, pass: r.pass, token: rid(32), name: name, username: un, bio: "", region: clean(r.region, 60), age: clean(r.age, 3),
        goal: 20, private: false, color: Math.floor(Math.random() * 8), createdAt: now(), lastActive: now() };
      db.users.push(u);
      return { touched: ["users"], res: { token: u.token, me: self(db, u, r.today) } };
    },
    login: function (db, r) {
      var phone = normPhone(r.phone), u = db.users.filter(function (x) { return x.phone === phone; })[0];
      if (!u || u.pass !== r.pass) fail("Telefon raqam yoki parol noto'g'ri");
      if (!u.token) u.token = rid(32);
      u.lastActive = now();
      return { touched: ["users"], res: { token: u.token, me: self(db, u, r.today) } };
    },
    logoutAll: function (db, r) { var u = me(db, r); u.token = rid(32); return { touched: ["users"], res: { ok: true } }; },
    me: function (db, r) { var u = me(db, r); return { touched: ["users"], res: { me: self(db, u, r.today) } }; },
    saveProfile: function (db, r) {
      var u = me(db, r), p = r.profile || {};
      if (p.name != null) { var n = clean(p.name, 60); if (n.length < 2) fail("Ism juda qisqa"); u.name = n; }
      if (p.username != null) {
        var un = clean(p.username, 24).toLowerCase().replace(/[^a-z0-9_.]/g, "");
        if (un.length < 3) fail("Taxallus kamida 3 ta belgi bo'lsin");
        if (db.users.some(function (x) { return x.username === un && x.id !== u.id; })) fail("Bu taxallus band");
        u.username = un;
      }
      ["bio", "region", "age", "gender", "job"].forEach(function (k) { if (p[k] != null) u[k] = clean(p[k], k === "bio" ? 300 : 60); });
      if (p.goal != null) u.goal = Math.max(1, Math.min(1000, int(p.goal) || 20));
      if (p.private != null) u.private = !!p.private;
      if (p.newPass) { if (u.pass !== p.oldPass) fail("Joriy parol noto'g'ri"); u.pass = p.newPass; u.mustChange = false; }
      return { touched: ["users"], res: { me: self(db, u, r.today) } };
    },
    saveBook: function (db, r) {
      var u = me(db, r), b = r.book || {};
      var title = clean(b.title, 160); if (!title) fail("Kitob nomini yozing");
      var old = db.books.filter(function (x) { return x.id === b.id && x.userId === u.id; })[0];
      var rec = old || { id: rid(12), userId: u.id, createdAt: now() };
      var sessions = Array.isArray(b.sessions) ? b.sessions.slice(-500).map(function (s) { return { d: clean(s.d, 10), from: int(s.from), to: int(s.to), note: clean(s.note, 500) }; }) : (rec.sessions || []);
      var status = ["reading", "done", "plan"].indexOf(b.status) >= 0 ? b.status : "reading";
      var f = { title: title, author: clean(b.author, 120), genre: clean(b.genre, 40), pages: int(b.pages), current: int(b.current), status: status,
        start: clean(b.start, 10), end: clean(b.end, 10), planDate: clean(b.planDate, 10), recBy: clean(b.recBy, 120), gift: !!b.gift,
        giftFrom: clean(b.giftFrom, 120), experience: clean(b.experience, 3000), recTo: clean(b.recTo, 200),
        rating: Math.max(0, Math.min(5, int(b.rating))), sessions: sessions, updated: now() };
      if (f.pages && f.current > f.pages) f.current = f.pages;
      for (var k in f) rec[k] = f[k];
      if (!old) db.books.push(rec);
      return { touched: ["books", "users"], res: { me: self(db, u, r.today), id: rec.id } };
    },
    deleteBook: function (db, r) {
      var u = me(db, r);
      db.books = db.books.filter(function (x) { return !(x.id === r.id && x.userId === u.id); });
      return { touched: ["books", "users"], res: { me: self(db, u, r.today) } };
    },
    feed: function (db, r) {
      var u = me(db, r), list = db.posts.slice();
      if (r.mode === "following") { var f = db.follows.filter(function (x) { return x.a === u.id; }).map(function (x) { return x.b; }); f.push(u.id); list = list.filter(function (p) { return f.indexOf(p.userId) >= 0; }); }
      if (r.userId) { var tu = db.users.filter(function (x) { return x.id === r.userId || x.username === r.userId; })[0]; var tid = tu ? tu.id : r.userId; list = list.filter(function (p) { return p.userId === tid; }); }
      if (r.bookKey) list = list.filter(function (p) { return p.bookKey === r.bookKey; });
      list.sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
      var lim = Math.min(int(r.limit) || 30, 100), page = list.slice(int(r.offset), int(r.offset) + lim);
      page.forEach(function (p) { if (p.userId !== u.id) p.views = (p.views || 0) + 1; });
      return { touched: ["posts", "users"], res: { posts: page.map(function (p) { return postView(db, p, u.id, r.today); }), total: list.length } };
    },
    createPost: function (db, r) {
      var u = me(db, r), text = clean(r.text, 1500);
      if (text.length < 2) fail("Fikringizni yozing");
      var recent = db.posts.filter(function (p) { return p.userId === u.id && Date.now() - new Date(p.createdAt).getTime() < 20000; });
      if (recent.length) fail("Biroz kutib, keyin yana yozing");
      var p = { id: rid(12), userId: u.id, text: text, rating: Math.max(0, Math.min(5, int(r.rating))), createdAt: now(), likes: [], comments: [], views: 0 };
      if (r.book && clean(r.book.title)) { p.bookTitle = clean(r.book.title, 160); p.bookAuthor = clean(r.book.author, 120); p.bookKey = bkey(p.bookTitle, p.bookAuthor); }
      db.posts.push(p);
      return { touched: ["posts", "users"], res: { post: postView(db, p, u.id, r.today) } };
    },
    deletePost: function (db, r) {
      var u = me(db, r);
      db.posts = db.posts.filter(function (p) { return !(p.id === r.id && p.userId === u.id); });
      return { touched: ["posts", "users"], res: { ok: true } };
    },
    like: function (db, r) {
      var u = me(db, r), p = db.posts.filter(function (x) { return x.id === r.id; })[0]; if (!p) fail("Fikr topilmadi");
      p.likes = p.likes || []; var i = p.likes.indexOf(u.id); if (i >= 0) p.likes.splice(i, 1); else p.likes.push(u.id);
      return { touched: ["posts", "users"], res: { post: postView(db, p, u.id, r.today) } };
    },
    comment: function (db, r) {
      var u = me(db, r), p = db.posts.filter(function (x) { return x.id === r.id; })[0]; if (!p) fail("Fikr topilmadi");
      var t = clean(r.text, 500); if (t.length < 1) fail("Izoh yozing");
      p.comments = p.comments || []; p.comments.push({ id: rid(8), userId: u.id, text: t, createdAt: now() });
      return { touched: ["posts", "users"], res: { post: postView(db, p, u.id, r.today) } };
    },
    follow: function (db, r) {
      var u = me(db, r); if (r.userId === u.id) fail("O'zingizga obuna bo'la olmaysiz");
      if (!db.users.some(function (x) { return x.id === r.userId; })) fail("Foydalanuvchi topilmadi");
      var had = db.follows.some(function (f) { return f.a === u.id && f.b === r.userId; });
      db.follows = db.follows.filter(function (f) { return !(f.a === u.id && f.b === r.userId); });
      if (!had) db.follows.push({ a: u.id, b: r.userId, t: now() });
      return { touched: ["follows", "users"], res: { following: !had, me: self(db, u, r.today) } };
    },
    user: function (db, r) {
      var u = me(db, r), t = db.users.filter(function (x) { return x.id === r.userId || x.username === r.userId; })[0];
      if (!t) fail("Foydalanuvchi topilmadi");
      var mine = t.id === u.id, hidden = t.private && !mine;
      var bn = db.media.filter(function (m) { return m.id === "banner_" + t.id; })[0];
      return { touched: ["users"], res: { user: pub(db, t, r.today), isMe: mine, hidden: hidden, banner: bn ? bn.data : "",
        followsMe: db.follows.some(function (f) { return f.a === t.id && f.b === u.id; }),
        iFollow: db.follows.some(function (f) { return f.a === u.id && f.b === t.id; }),
        stats: hidden ? null : (function () { var s = stats(db, t.id, r.today); delete s.days; return s; })(),
        books: hidden ? [] : db.books.filter(function (b) { return b.userId === t.id; }).map(publicBook) } };
    },
    people: function (db, r) {
      var u = me(db, r), q = clean(r.q, 60).toLowerCase();
      var list = db.users.filter(function (x) { return x.id !== u.id && (!q || (x.name + " " + x.username).toLowerCase().indexOf(q) >= 0); })
        .map(function (x) { return pub(db, x, r.today); }).sort(function (a, b) { return b.week - a.week || b.ball - a.ball; }).slice(0, int(r.limit) || 20);
      var f = db.follows.filter(function (x) { return x.a === u.id; }).map(function (x) { return x.b; });
      list.forEach(function (x) { x.iFollow = f.indexOf(x.id) >= 0; });
      return { touched: ["users"], res: { people: list } };
    },
    catalog: function (db, r) {
      me(db, r); var q = clean(r.q, 80).toLowerCase(), list = aggregate(db);
      if (q) list = list.filter(function (a) { return (a.title + " " + a.author).toLowerCase().indexOf(q) >= 0; });
      list.forEach(function (a) { a.users = a.users.length; });
      list.sort(function (a, b) { return b.readers - a.readers || b.rating - a.rating; });
      return { touched: ["users"], res: { books: list.slice(0, int(r.limit) || 60) } };
    },
    book: function (db, r) {
      var u = me(db, r), a = aggregate(db).filter(function (x) { return x.key === r.key; })[0];
      var readers = [], reviews = [];
      if (a) {
        readers = a.users.filter(function (id, i, arr) { return arr.indexOf(id) === i; }).map(function (id) { return pub(db, db.users.filter(function (x) { return x.id === id; })[0], r.today); })
          .filter(function (x) { return !x.private || x.id === u.id; }).slice(0, 30);
        reviews = db.books.filter(function (b) { return bkey(b.title, b.author) === r.key && b.experience && b.status !== "plan"; })
          .map(function (b) { var bu = db.users.filter(function (x) { return x.id === b.userId; })[0]; return bu && !bu.private ? { user: pub(db, bu, r.today), text: b.experience, rating: b.rating || 0, recTo: b.recTo || "", date: b.end || b.updated } : null; })
          .filter(Boolean);
        a = JSON.parse(JSON.stringify(a)); a.users = a.users.length;
      }
      var posts = db.posts.filter(function (p) { return p.bookKey === r.key; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; })
        .slice(0, 50).map(function (p) { return postView(db, p, u.id, r.today); });
      var mine = db.books.filter(function (b) { return b.userId === u.id && bkey(b.title, b.author) === r.key; })[0] || null;
      var same = a && a.author ? aggregate(db).filter(function (x) { return x.author.toLowerCase() === a.author.toLowerCase() && x.key !== a.key; }).slice(0, 10) : [];
      same.forEach(function (x) { x.users = x.users.length; });
      return { touched: ["users"], res: { book: a, readers: readers, reviews: reviews, posts: posts, mine: mine, same: same } };
    },
    leaderboard: function (db, r) {
      var u = me(db, r);
      var all = db.users.filter(function (x) { return !x.private || x.id === u.id; }).map(function (x) { return pub(db, x, r.today); })
        .sort(function (a, b) { return b.week - a.week || b.ball - a.ball; });
      var rank = 0; all.forEach(function (x, i) { x.rank = i + 1; if (x.id === u.id) rank = i + 1; });
      return { touched: ["users"], res: { top: all.slice(0, int(r.limit) || 20), myRank: rank, total: all.length } };
    },
    notifs: function (db, r) {
      var u = me(db, r), out = [];
      db.posts.filter(function (p) { return p.userId === u.id; }).forEach(function (p) {
        (p.comments || []).forEach(function (c) { if (c.userId !== u.id) out.push({ type: "comment", at: c.createdAt, by: c.userId, postId: p.id, text: c.text }); });
      });
      db.follows.filter(function (f) { return f.b === u.id; }).forEach(function (f) { out.push({ type: "follow", at: f.t, by: f.a }); });
      out.sort(function (a, b) { return b.at < a.at ? -1 : 1; });
      out = out.slice(0, 40).map(function (n) { var bu = db.users.filter(function (x) { return x.id === n.by; })[0]; n.user = bu ? { id: bu.id, name: bu.name, color: bu.color || 0, avatar: bu.avatar || "" } : { name: "?" }; return n; });
      return { touched: ["users"], res: { notifs: out } };
    },
    publicStats: function (db) {
      var pages = 0, done = 0; db.books.forEach(function (b) { pages += pagesRead(b); if (b.status === "done") done++; });
      return { touched: [], res: { readers: db.users.length, books: db.books.length, done: done, pages: pages, posts: db.posts.length } };
    },
    setMedia: function (db, r) {
      var u = me(db, r), data = String(r.data || "");
      if (data && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) fail("Rasm formati noto'g'ri");
      if (r.kind === "avatar") {
        if (data.length > 14000) fail("Rasm juda katta");
        u.avatar = data;
        return { touched: ["users"], res: { me: self(db, u, r.today) } };
      }
      if (r.kind === "banner") {
        if (data.length > 46000) fail("Rasm juda katta");
        var id = "banner_" + u.id;
        db.media = db.media.filter(function (m) { return m.id !== id; });
        if (data) db.media.push({ id: id, userId: u.id, data: data, t: now() });
        return { touched: ["media", "users"], res: { me: self(db, u, r.today), banner: data } };
      }
      fail("Noma'lum rasm turi");
    },
    library: function (db, r, cfg) {
      var isAdm = cfg && cfg.adminKey && r.key === cfg.adminKey;
      if (!isAdm) me(db, r);
      var list = (db.library || []).filter(function (L) { return isAdm || L.published; }).map(libView)
        .sort(function (a, b) { return (b.createdAt || "") < (a.createdAt || "") ? -1 : 1; });
      return { touched: isAdm ? [] : ["users"], res: { library: list } };
    },
    adminSaveLib: function (db, r, cfg) {
      if (!cfg || !cfg.adminKey || r.key !== cfg.adminKey) fail("Admin kaliti noto'g'ri");
      var b = r.book || {}, title = clean(b.title, 160); if (!title) fail("Kitob nomini yozing");
      var old = db.library.filter(function (x) { return x.id === b.id; })[0], rec = old || { id: rid(10), createdAt: now() };
      var audio = (Array.isArray(b.audio) ? b.audio : []).slice(0, 200).map(function (a, i) { var f = cleanFile(a); if (!f) return null; f.title = clean(a.title, 120) || ((i + 1) + "-qism"); return f; }).filter(Boolean);
      var f = { title: title, author: clean(b.author, 120), genre: clean(b.genre, 40), pages: int(b.pages), desc: clean(b.desc, 3000), summary: clean(b.summary, 20000), summaryAudio: cleanFile(b.summaryAudio),
        cover: cleanFile(b.cover), pdf: cleanFile(b.pdf), audio: audio, published: !!b.published, updated: now() };
      for (var k in f) rec[k] = f[k];
      if (!old) db.library.push(rec);
      return { touched: ["library"], res: { book: libView(rec) } };
    },
    adminDeleteLib: function (db, r, cfg) {
      if (!cfg || !cfg.adminKey || r.key !== cfg.adminKey) fail("Admin kaliti noto'g'ri");
      db.library = db.library.filter(function (x) { return x.id !== r.id; });
      return { touched: ["library"], res: { ok: true } };
    },
    adminResetPass: function (db, r, cfg) {
      if (!cfg || !cfg.adminKey || r.key !== cfg.adminKey) fail("Admin kaliti noto'g'ri");
      var u = db.users.filter(function (x) { return x.id === r.userId; })[0];
      if (!u) fail("Foydalanuvchi topilmadi");
      if (!r.pass || String(r.pass).length < 20) fail("Parol noto'g'ri");
      u.pass = r.pass; u.token = rid(32); u.mustChange = true;
      return { touched: ["users"], res: { ok: true } };
    },
    adminDeletePost: function (db, r, cfg) {
      if (!cfg || !cfg.adminKey || r.key !== cfg.adminKey) fail("Admin kaliti noto'g'ri");
      db.posts = db.posts.filter(function (p) { return p.id !== r.id; });
      return { touched: ["posts"], res: { ok: true } };
    },
    admin: function (db, r, cfg) {
      if (!cfg || !cfg.adminKey || r.key !== cfg.adminKey) fail("Admin kaliti noto'g'ri");
      var days = 30, daily = [], i, byDay = {};
      for (i = days - 1; i >= 0; i--) { var dd = addDays(r.today, -i); byDay[dd] = { d: dd, pages: 0, active: {}, joined: 0, posts: 0, done: 0 }; daily.push(byDay[dd]); }
      db.books.forEach(function (b) {
        (b.sessions || []).forEach(function (s) { var x = byDay[s.d]; if (x) { x.pages += Math.max(0, (s.to || 0) - (s.from || 0)); x.active[b.userId] = 1; } });
        if (b.status === "done" && b.end && byDay[b.end]) byDay[b.end].done++;
      });
      db.users.forEach(function (u) { var x = byDay[String(u.createdAt || "").slice(0, 10)]; if (x) x.joined++; });
      db.posts.forEach(function (p) { var x = byDay[String(p.createdAt || "").slice(0, 10)]; if (x) x.posts++; });
      daily.forEach(function (x) { x.active = Object.keys(x.active).length; });
      var recent = db.posts.slice().sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; }).slice(0, 40).map(function (p) { return postView(db, p, "", r.today); });
      var users = db.users.map(function (x) { var p = pub(db, x, r.today), s = stats(db, x.id, r.today); p.phone = x.phone; p.region = x.region || ""; p.age = x.age || "";
        p.current = s.current; p.plan = s.plan; p.reading = s.reading; return p; });
      return { touched: [], res: { users: users, books: db.books.map(function (b) { var o = publicBook(b); o.userId = b.userId; return o; }),
        posts: db.posts.length, daily: daily, recent: recent, catalogAll: aggregate(db).map(function (a) { a.users = a.users.length; return a; }), catalog: aggregate(db).map(function (a) { a.users = a.users.length; return a; }).sort(function (a, b) { return b.readers - a.readers; }).slice(0, 20) } };
    }
  };

  function handle(db, req, cfg) {
    TABLES.forEach(function (t) { db[t] = db[t] || []; });
    req = req || {};
    if (!req.today || !/^\d{4}-\d{2}-\d{2}$/.test(req.today)) req.today = new Date().toISOString().slice(0, 10);
    var fn = H[req.action];
    if (!fn) return { result: { ok: false, error: "Noma'lum amal" }, touched: [] };
    try {
      var out = fn(db, req, cfg); out.res.ok = true;
      return { result: out.res, touched: out.touched };
    } catch (e) {
      return { result: { ok: false, error: e.userMessage || ("Server xatosi: " + e.message) }, touched: [] };
    }
  }
  return { handle: handle, stats: stats, TABLES: TABLES, MILESTONES: MILESTONES, bkey: bkey, addDays: addDays, rid: rid };
})();

