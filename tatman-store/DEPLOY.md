# نشر وإدارة متجر تطمن

المتجر **Web Service** على Render (ليس Static Site) لأن لوحة التحكم تحتاج حفظ المنتجات والطلبات.

## الروابط الحية

- المتجر: https://tatmanvet.com
- الإدارة: https://tatmanvet.com/admin
- نسخة Render: https://tatman-vet-web.onrender.com
- لوحة Render: https://dashboard.render.com/web/srv-da6n12vavr4c739dh1ag

الخدمة: `tatman-vet-web` (`srv-da6n12vavr4c739dh1ag`)  
الفرع: `cursor/tatman-vet-store-8ce2` حتى الدمج في `main`  
Root Directory: `tatman-store`

**لا تعدّل** خدمة LIMS: `rare-vet-lims`.

## لوحة التحكم

- الرابط: `https://tatmanvet.com/admin`
- محلياً كلمة المرور الافتراضية: `Tatman#2026`
- على Render غيّر Environment Variable: `ADMIN_PASSWORD` إلى كلمة سر قوية

من اللوحة:
- المنتجات وأسعار قطر / السعودية
- إظهار المنتج في قطر أو السعودية أو الاثنين
- الطلبات وحالة كل طلب (جديد، بانتظار الدفع، مؤكد، مدفوع، تم الشحن، ملغى)
- العملاء المسجّلون: الاسم والرقم والدولة
- أكواد الخصم (نسبة أو مبلغ ثابت، دولة، حد أدنى، عدد استخدامات، تاريخ انتهاء)
- أرقام واتساب، IBAN، وتفعيل طرق الدفع لكل دولة

## طرق الدفع الحالية

لكل دولة يمكن تفعيل:
- واتساب
- تحويل بنكي (IBAN من الإعدادات)
- الدفع عند الاستلام
- بطاقة / مدى
- أبل باي (Apple Pay) — الطلب يُسجَّل بانتظار الدفع حتى ربط بوابة مثل Tap/Moyasar

## إعداد Render الحالي

| البند | القيمة |
|---|---|
| النوع | Web Service (Node) |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health | `/api/health` |
| Disk | 1GB على `/var/data` |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATA_DIR` | `/var/data` |
| `ADMIN_PASSWORD` | غيّرها من لوحة Render |
| `SESSION_SECRET` | نص عشوائي موجود على الخدمة |

`NODE_ENV=production` يجعل `npm ci` يتخطى `devDependencies` (ومنها Vite). لذلك أمر البناء يجب أن يبقى `npm ci --include=dev && npm run build`.

الخدمة القديمة Static Site `tatman-vet-store` تُركت كنسخة احتياطية بدون الدومين. الدومين مربوط بـ `tatman-vet-web`.

## DNS (Namecheap)

- **A** `@` → `216.24.57.1` (Render)
- **CNAME** `www` → `tatman-vet-web.onrender.com.` (يفضّل تحديثه من القيمة القديمة `tatman-vet-store.onrender.com.`)

`www` يعيد التوجيه حالياً إلى https://tatmanvet.com حتى قبل تحديث الـ CNAME، لأن الدومين مربوط بالخدمة الجديدة على Render.

بعد الدمج في `main` غيّر Branch في Render إلى `main`.

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
