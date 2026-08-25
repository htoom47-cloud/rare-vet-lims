# نشر متجر تطمن على Render → tatmanvet.com

هذا متجر **Static Site** منفصل عن LIMS. لا تعدّل خدمة `rare-vet-lims`.

## 1) إنشاء الموقع في Render

1. افتح [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Static Site**
3. وصّل GitHub واختر المستودع: `htoom47-cloud/rare-vet-lims`
4. املأ الحقول كالتالي:

| الحقل | القيمة |
|--------|--------|
| Name | `tatman-vet-store` |
| Branch | `cursor/tatman-vet-store-8ce2` (حتى يتم دمج الـ PR) ثم حوّله إلى `main` |
| Root Directory | `tatman-store` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |

5. Environment:
   - `NODE_VERSION` = `22`
6. **Create Static Site** وانتظر حتى يصبح **Live**
7. افتح الرابط `https://tatman-vet-store.onrender.com` للتأكد

## 2) توجيه الصفحات الداخلية (مهم)

في الخدمة: **Redirects/Rewrites** → أضف:

- Action: **Rewrite**
- Source: `/*`
- Destination: `/index.html`

بدون هذا، صفحات `/shop` و `/product/...` لن تعمل عند التحديث.

## 3) ربط الدومين tatmanvet.com

1. داخل الخدمة: **Settings → Custom Domains → Add**
2. أضف: `tatmanvet.com` (Render يضيف `www` عادة تلقائياً)
3. في لوحة الدومين ضع DNS كما يظهر Render. الشائع:

| Type | Name | Value |
|------|------|--------|
| A | `@` | `216.24.57.1` |
| CNAME | `www` | `tatman-vet-store.onrender.com` |

4. احذف أي سجل **AAAA** (IPv6) إن وُجد — Render لا يدعمه
5. ارجع إلى Render واضغط **Verify**
6. انتظر شهادة HTTPS ثم افتح https://tatmanvet.com

## 4) بعد دمج PR #8

حوّل Branch في Render إلى `main` حتى كل تحديث على المتجر ينشر تلقائياً.
