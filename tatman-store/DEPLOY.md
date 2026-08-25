# نشر متجر تطمن على tatmanvet.com

المتجر جاهز كملفات ثابتة (`npm run build` → مجلد `dist`).

## الطريقة الأسرع: Vercel (موصى بها)

1. ادخل [vercel.com](https://vercel.com) وسجّل بحساب GitHub `htoom47-cloud`
2. **Add New Project** → اختر مستودع `rare-vet-lims`
3. الإعدادات:
   - **Root Directory:** `tatman-store`
   - **Framework:** Vite
   - **Build Command:** `npm run build`
   - **Output:** `dist`
4. Deploy
5. **Settings → Domains** → أضف:
   - `tatmanvet.com`
   - `www.tatmanvet.com`

### DNS عند مزوّد الدومين (tatmanvet.com)

من لوحة Vercel انسخ القيم الدقيقة. عادة:

| Type  | Name | Value                 |
|-------|------|-----------------------|
| A     | `@`  | `76.76.21.21`         |
| CNAME | `www`| `cname.vercel-dns.com`|

انتظر انتشار DNS (غالباً دقائق إلى ساعات) ثم افتح https://tatmanvet.com

---

## بديل: Render (نفس منصة المختبر)

1. Render → **New Static Site**
2. Repo: `rare-vet-lims`
3. Root Directory: `tatman-store`
4. Build: `npm ci && npm run build`
5. Publish: `dist`
6. Custom Domain: `tatmanvet.com` + `www.tatmanvet.com`
7. اتبع سجلات DNS التي يعطيها Render

يوجد ملف جاهز: `tatman-store/render.yaml`

---

## بديل: GitHub Pages

1. في GitHub → Settings → Pages → Source: **GitHub Actions**
2. Workflow جاهز: `.github/workflows/deploy-tatman.yml`
3. أضف Custom Domain: `tatmanvet.com`
4. فعّل Enforce HTTPS بعد انتشار DNS

---

## بناء محلي للتحقق

```bash
cd tatman-store
npm ci
npm run build
npm run preview
```
