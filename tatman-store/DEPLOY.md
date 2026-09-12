# نشر وإدارة متجر تطمن

المتجر **Web Service** على Render (ليس Static Site) لأن لوحة التحكم تحتاج حفظ المنتجات والطلبات.

## إعادة إنشاء الخدمة بعد حذفها من Render

المتجر موجود على فرع `cursor/tatman-vet-store-8ce2` فقط (ليس على `main`). أنشئ الخدمة من هذا الفرع.

في [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**:

1. وصّل المستودع `htoom47-cloud/rare-vet-lims` (نفس GitHub).
2. املأ الإعدادات التالية ثم **Create Web Service**:

| البند | القيمة |
|---|---|
| Name | `tatman-vet-web` |
| Language | Node |
| Branch | `cursor/tatman-vet-store-8ce2` |
| Root Directory | `tatman-store` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance | Starter (أو Free للتجربة) |
| Region | Frankfurt |

3. Environment:

| المتغير | القيمة |
|---|---|
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATA_DIR` | `/var/data` |
| `ADMIN_PASSWORD` | كلمة سر قوية للإدارة |
| `SESSION_SECRET` | نص عشوائي طويل |

4. Disk: أضف قرصاً 1GB ومساره `/var/data`.
5. Health Check Path: `/api/health`
6. بعد أول نشر ناجح: **Settings → Custom Domains** → أضف `tatmanvet.com` و `www.tatmanvet.com`.
7. DNS في Namecheap كما هو أسفل الصفحة.

**لا تعدّل** خدمة LIMS: `rare-vet-lims`.  
القرص الجديد فارغ: المنتجات والطلبات القديمة تُفقد إذا لم يكن هناك نسخة احتياطية من `/var/data`.

## الروابط الحية

- المتجر: https://tatmanvet.com
- الإدارة: https://tatmanvet.com/admin
- نسخة Render: https://tatman-vet-web.onrender.com

الخدمة: `tatman-vet-web`  
الفرع: `cursor/tatman-vet-store-8ce2` حتى الدمج في `main`  
Root Directory: `tatman-store`

## لوحة التحكم

- الرابط: `https://tatmanvet.com/admin`
- محلياً كلمة المرور الافتراضية: `Tatman#2026`
- على Render غيّر Environment Variable: `ADMIN_PASSWORD` إلى كلمة سر قوية

من اللوحة:
- المنتجات وأسعار قطر / السعودية
- إظهار المنتج في قطر أو السعودية أو الاثنين
- الطلبات مع فلتر الدولة وحالة الطلب
- الإيرادات (قطر و السعودية منفصلان؛ المحتسب: مؤكد / مدفوع / مشحون)
- العملاء المسجّلون: الاسم والرقم والدولة
- مستخدمو الإدارة وصلاحياتهم
- شركات التوصيل لكل دولة (تفعيل، رسوم، تتبع)
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
