# Norma CBC Bridge — جسر Norma (تشغيل دائم 24/7)

يربط جهاز **Norma iVet-5** بنظام LIMS السحابي عبر كمبيوتر المعمل.

---

## التثبيت الدائم (مرة واحدة — موصى به)

1. انسخ مجلد `bridge` إلى **`C:\RareVet\bridge`**
2. افتح **PowerShell كمسؤول (Run as administrator)**
3. نفّذ:

```powershell
cd C:\RareVet\bridge
.\install-persistent-bridge.ps1
```

4. أدخل `DEVICE_ID` و `DEVICE_API_KEY` من LIMS → **أجهزة المختبر** → Norma CBC

### ماذا يفعل التثبيت الدائم؟

| المكوّن | الوظيفة |
|---------|---------|
| **PM2** | يشغّل الجسر في الخلفية ويعيد التشغيل عند التعطل |
| **pm2-startup** | يبدأ الجسر تلقائياً عند تشغيل Windows |
| **Windows Firewall** | يسمح لـ Norma بالاتصال على المنفذ **21110** |
| **Watchdog** | كل **10 دقائ** يتحقق ويعيد تشغيل الجسر إن توقف |
| **إعادة محاولة LIMS** | 3 محاولات عند انقطاع الإنترنت المؤقت |

---

## إعدادات Norma (ثابتة — لا تغيّرها)

| الحقل | القيمة |
|-------|--------|
| **LIS IP** | IP كمبيوتر المعمل — `ipconfig` (مثل **192.168.1.102**) |
| **LIS port** | **21110** |
| **Protocol** | **HL7_1.0** |
| **Auto LIS transmission** | **ON** |
| **Repeat Sample ID as Patient ID** | **ON** |

### Sample ID على Norma

استخدم باركود **`BC-...`** من الملصق (أو `SMP-...`).

### نوع الحيوان والمعدلات الطبيعية

على Norma **كل نوع حيوان له معدلات طبيعية خاصة** (إبل، خيل، غنم، …).

1. اختر **نفس نوع الحيوان** على Norma كما سجّلته في LIMS عند تسجيل العينة.
2. عند الإرسال، LIMS يقرأ المعدلات من **حقل OBX-7** في HL7 **بنفس الأرقام** الظاهرة على شاشة Norma.
3. تُحفظ المعدلات في LIMS حسب نوع الحيوان (`camel` / `horse` / `sheep` / `goat`).
4. إذا اختلف نوع الحيوان بين Norma وLIMS، تُستخدم معدلات Norma مع تسجيل تحذير في السجل.

---

## IP ثابت (مهم جداً)

في **راوتر الشبكة** أو إعدادات Windows:

- ثبّت IP لكمبيوتر المعمل (مثل `192.168.1.102`)
- حتى لا يتغير IP بعد إعادة تشغيل الراوتر وينقطع Norma

---

## التحقق اليومي

```powershell
cd C:\RareVet\bridge
.\verify-bridge.ps1
pm2 status
pm2 logs norma-bridge --lines 20
```

يجب أن ترى:
- `Port 21110 listening: OK`
- `norma-bridge │ online`
- `LIMS cloud reachable: 200`

---

## السحابة (LIMS على Render)

عند كل نشر جديد، السيرفر تلقائياً:
- يحدّث معاملات CBC (`sync-cbc`)
- يحدّث المعدلات الطبيعية (`sync-norma-refs`)

**لا تحتاج** تشغيل أوامر يدوياً على Render بعد كل تحديث.

---

## أوامر PM2

```powershell
pm2 status
pm2 logs norma-bridge
pm2 restart norma-bridge
pm2 save
```

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| Norma لا يرسل | تحقق LIS IP + port 21110 |
| `Forward failed` | تحقق الإنترنت + `verify-bridge.ps1` |
| `Sample not found` | سجّل العينة في LIMS + استخدم BC-... |
| الجسر متوقف بعد reboot | شغّل `install-persistent-bridge.ps1` كمسؤول |
| ECONNRESET في logs | طبيعي — Norma يغلق TCP بعد ACK |

---

## تحديث الجسر بعد تعديل الكود

```powershell
# من مجلد المشروع أو بعد نسخ bridge/ الجديد
cd C:\RareVet\bridge
.\configure-lab-bridge.ps1 -Persistent
```

أو كمسؤول: `.\install-persistent-bridge.ps1`
