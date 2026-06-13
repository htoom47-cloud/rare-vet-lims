# Norma CBC Bridge — جسر Norma

يربط جهاز Norma CBC بالنظام السحابي عبر كمبيوتر المعمل.

## الإعداد السريع (تشغيل دائم — PM2)

1. انسخ مجلد `bridge` إلى `C:\RareVet\bridge`
2. انسخ `bridge.env.example` إلى `bridge.env`
3. من الموقع **أجهزة المختبر** انسخ `DEVICE_ID` و `DEVICE_API_KEY` إلى `bridge.env`
4. افتح PowerShell **كمسؤول** داخل المجلد:

```powershell
cd C:\RareVet\bridge
.\install-bridge.ps1
```

## التشغيل اليدوي

```cmd
start-bridge.bat
```

## إضافة للتشغيل عند فتح Windows (بدون PM2)

1. اضغط `Win + R` → اكتب `shell:startup`
2. أنشئ اختصاراً لـ `start-bridge.bat` في المجلد الذي يفتح

## إعدادات Norma

| الحقل | القيمة |
|-------|--------|
| LIS IP | IP كمبيوتر الجسر (مثل 192.168.1.104) |
| LIS port | 21110 |
| Protocol | HL7_1.0 |
| Auto LIS transmission | مفعّل |
| Repeat Sample ID as Patient ID | مفعّل |

## Sample ID على Norma

استخدم `BC-...` أو `SMP-...` من ملصق العينة.

## أوامر PM2

```powershell
pm2 status
pm2 logs norma-bridge
pm2 restart norma-bridge
```
