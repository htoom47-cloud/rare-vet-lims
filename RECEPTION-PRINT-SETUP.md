# إعداد الطباعة المباشرة — جهاز الاستقبال

يدعم جسر LIMS المحلي طابعتين من نفس الخدمة:

- Zebra `ZDesigner ZD421-203dpi ZPL` لطباعة الملصقات بصيغة RAW ZPL.
- Epson `EPSON TM-T20III Receipt` لطباعة فواتير PDF حرارية بعرض 80mm.

## الإعداد مرة واحدة

افتح PowerShell وشغّل:

```powershell
cd C:\Users\<USER>\Projects\rare-vet-lims\tools
powershell -ExecutionPolicy Bypass -File .\setup-lims-print-bridge.ps1
```

يقوم السكربت بتثبيت محرك الطباعة المحلي، الوثوق بشهادة HTTPS، والتحقق من
الطابعتين، ثم إضافة `LIMS Print Bridge` إلى برامج بدء تشغيل ويندوز.

للتحقق:

- `http://127.0.0.1:9100/epson/status` أثناء التطوير المحلي.
- `https://127.0.0.1:9101/epson/status` عند استخدام موقع LIMS السحابي.

يجب أن تكون النتيجة:

```json
{"ready":true,"printer":"EPSON TM-T20III Receipt"}
```

## الاستخدام اليومي

لا يلزم فتح نافذة طباعة:

1. زر **طباعة ملصق** يرسل الملصق مباشرة إلى Zebra.
2. زر **طباعة حرارية (80مم)** يجلب قالب الفاتورة الحراري ويرسله مباشرة إلى Epson.
3. زر PDF/A4 يبقى للطباعة العادية أو التنزيل.

الجسر يعمل تلقائيًا بعد تسجيل الدخول إلى ويندوز. للتشغيل اليدوي:

```bat
tools\start-lims-print-bridge.bat
```

## استكشاف الأخطاء

- **الجسر غير مشغّل:** شغّل `start-lims-print-bridge.bat`.
- **Epson غير موجودة:** يجب أن يطابق اسم ويندوز تمامًا
  `EPSON TM-T20III Receipt`.
- **الموقع السحابي لا يصل للجسر:** افتح
  `https://127.0.0.1:9101/epson/status` مرة واحدة وتأكد أن الشهادة موثوقة.
- **الحجم غير صحيح:** اضبط تعريف Epson على رول 80mm واترك المقياس للجسر
  على `noscale`.
- **لا يتم القص:** فعّل Auto Cut / Cut at end of document من تفضيلات تعريف Epson.

يمكن تغيير اسم الطابعة أو مصادر LIMS المسموحة قبل التشغيل:

```powershell
$env:EPSON_PRINTER_NAME='EPSON TM-T20III Receipt'
$env:LIMS_PRINT_ALLOWED_ORIGINS='https://lims.rarevetcare.com,http://localhost:5173'
```
