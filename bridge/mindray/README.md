# Mindray BS-120 Chemistry Bridge

جسر مستقل لربط **Mindray BS-120** بـ Rare Vet LIMS — **لا يتعارض مع جسر Norma** (منفذ 21110).

| الجسر | المنفذ | المجلد | PM2 |
|-------|--------|--------|-----|
| Norma CBC | 21110 | `C:\RareVet\bridge` | `norma-bridge` |
| Mindray BS-120 | **5150** | `C:\RareVet\mindray-bridge` | `mindray-bridge` |

---

## 1) تسجيل الجهاز في LIMS (مرة واحدة)

على السيرفر (أو محلياً مع اتصال قاعدة البيانات):

```bash
cd backend
node src/scripts/setup-mindray-device.js
```

احفظ المخرجات: `DEVICE_ID` و `DEVICE_API_KEY` ومحتوى `mindray-bridge.env`.

لإعادة توليد المفتاح لاحقاً:

```bash
node src/scripts/setup-mindray-device.js --regenerate-key
```

---

## 2) التثبيت على كمبيوتر المعمل

انسخ مجلد `bridge/mindray` إلى `C:\RareVet\mindray-bridge` أو شغّل من المشروع:

```powershell
cd C:\RareVet\mindray-bridge
# أو من المشروع:
cd path\to\rare-vet-lims\bridge\mindray

.\configure-mindray-bridge.ps1
```

لتشغيل دائم (جدار ناري + PM2 عند الإقلاع + مراقبة كل 10 دقائق) — **كمسؤول**:

```powershell
.\install-mindray-bridge.ps1
```

---

## 3) إعدادات Mindray (Setup → System → LIS)

| الحقل | القيمة |
|-------|--------|
| Enable LIS | ✓ |
| **LIS Host IP** | IP كمبيوتر المعمل (`ipconfig`) — **ليس** `127.0.0.1` |
| Port | **5150** |
| Connect to LIS When Started Up | ✓ |
| Bidirectional Mode | غير مفعّل (في البداية) |

### Test Correspondence (Code On LIS)

| اختبار الجهاز | Code On LIS |
|---------------|-------------|
| Glu | GLU |
| Urea / UREA / URE | BUN |
| Crea | CREA |
| AST | AST |
| ALT | ALT |
| ALP | ALP |
| T.P | TP |

---

## 4) سير العمل

1. سجّل عينة في LIMS وأضف **CHEM-BASIC** (كيمياء).
2. استخدم باركود **`BC-...`** كـ Sample ID على Mindray.
3. شغّل التحليل — النتائج تُرسل تلقائياً إلى LIMS.

---

## التحقق

```powershell
.\verify-mindray-bridge.ps1
pm2 logs mindray-bridge --lines 20
```

في LIMS: **أجهزة المختبر** → اختر **Mindray BS-120** → رسائل الجهاز.

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| HOST غير متصل | غيّر LIS IP من `127.0.0.1` إلى IP المعمل |
| المنفذ مشغول | Norma=21110، Mindray=5150 — منافذ مختلفة |
| `Sample not found` | سجّل العينة في LIMS أولاً |
| `No matching parameters` | راجع Test Correspondence + شغّل `setup-mindray-device.js` |
| `Forward failed` | تحقق من الإنترنت و`DEVICE_API_KEY` |

---

## الملفات (مجلد مستقل)

```
bridge/mindray/
  mindray-listener.js          # الجسر TCP → LIMS
  ecosystem.mindray.config.cjs # PM2: mindray-bridge
  configure-mindray-bridge.ps1
  install-mindray-bridge.ps1
  verify-mindray-bridge.ps1
  mindray-watchdog.ps1
  mindray-bridge.env.example

backend/src/scripts/setup-mindray-device.js
backend/src/utils/mindray-chem-map.js
```

**لم يُعدَّل أي ملف موجود** (Norma bridge، Devices.jsx، devices.service.js، إلخ).
