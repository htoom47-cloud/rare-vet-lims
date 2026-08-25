# نشر وإدارة متجر تطمن

المتجر أصبح **Web Service** (ليس Static Site) لأن لوحة التحكم تحتاج حفظ المنتجات والطلبات.

## لوحة التحكم
- الرابط: `https://tatmanvet.com/admin`
- كلمة المرور الافتراضية محلياً: `Tatman#2026`
- على Render ضع Environment Variable: `ADMIN_PASSWORD`

من اللوحة:
- المنتجات وأسعار قطر / السعودية
- إظهار المنتج في قطر أو السعودية أو الاثنين
- الطلبات وحالتها
- أرقام واتساب، IBAN، وتفعيل طرق الدفع لكل دولة

## طرق الدفع الحالية
لكل دولة يمكن تفعيل:
- واتساب
- تحويل بنكي (IBAN من الإعدادات)
- الدفع عند الاستلام
- بطاقة / مدى (يمكن تفعيلها من الإعدادات؛ حتى ربط بوابة دفع مثل Tap/Moyasar يبقى الطلب مسجّلاً للتأكيد)

## تحويل الخدمة في Render (مهم)

الخدمة الحالية Static Site لا تشغّل لوحة التحكم. اعمل التالي:

1. **New + → Web Service**
2. نفس المستودع `rare-vet-lims`
3. Branch: `cursor/tatman-vet-store-8ce2` ثم `main` بعد الدمج
4. Root Directory: `tatman-store`
5. Runtime: Node
6. Build: `npm ci && npm run build`
7. Start: `npm start`
8. Environment:
   - `NODE_VERSION=22`
   - `NODE_ENV=production`
   - `DATA_DIR=/var/data`
   - `ADMIN_PASSWORD=` كلمة سر قوية
   - `SESSION_SECRET=` نص عشوائي
9. Disk: أضف قرص 1GB على `/var/data` حتى لا تُمسح الطلبات بعد إعادة النشر
10. انقل الدومين `tatmanvet.com` من الـ Static Site القديم إلى هذا الـ Web Service

## تشغيل محلي

```bash
cd tatman-store
npm install
npm run dev:api
# في طرفية ثانية:
npm run dev
```

المتجر: http://localhost:5177  
الإدارة: http://localhost:5177/admin
