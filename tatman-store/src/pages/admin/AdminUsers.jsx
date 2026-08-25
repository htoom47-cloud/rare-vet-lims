import { useEffect, useState } from "react";
import { api } from "../../api";
import { PERMISSIONS, emptyPermissions } from "../../data/permissions";

function blankForm() {
  return {
    username: "",
    name: "",
    password: "",
    active: true,
    permissions: emptyPermissions(),
  };
}

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    const d = await api.users();
    setUsers(d.users || []);
  }

  useEffect(() => {
    load().catch(() => setUsers([]));
  }, []);

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved("");
  }

  function togglePerm(id) {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [id]: !f.permissions[id] } }));
    setSaved("");
  }

  function startEdit(u) {
    setEditId(u.id);
    setForm({
      username: u.username || "",
      name: u.name || "",
      password: "",
      active: u.active !== false,
      permissions: { ...emptyPermissions(), ...(u.permissions || {}) },
    });
    setError("");
    setSaved("");
  }

  function resetForm() {
    setEditId(null);
    setForm(blankForm());
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const body = {
        username: form.username,
        name: form.name,
        active: form.active,
        permissions: form.permissions,
      };
      if (form.password) body.password = form.password;
      const data = await api.saveUser(editId, body);
      if (!data.user?.id) throw new Error("save_failed");
      await load();
      resetForm();
      setSaved("تم حفظ المستخدم.");
    } catch (err) {
      if (err?.status === 409) setError("اسم المستخدم موجود مسبقاً.");
      else if (err?.message === "username_reserved") setError("اسم admin محجوز لمالك النظام.");
      else if (err?.message === "username_required") setError("أدخل اسم مستخدم من 3 أحرف على الأقل.");
      else if (err?.message === "password_required") setError("أدخل كلمة مرور للمستخدم الجديد.");
      else if (err?.message === "password_short") setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      else setError("تعذر الحفظ. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm("حذف هذا المستخدم؟")) return;
    try {
      await api.deleteUser(id);
      if (editId === id) resetForm();
      await load();
    } catch (err) {
      setError(err?.message === "cannot_delete_self" ? "لا يمكنك حذف حسابك." : "تعذر الحذف.");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h1 className="text-3xl font-extrabold">مستخدمو الإدارة</h1>
        <p className="mt-2 text-sm text-black/55">
          أضف موظفين وحدد صلاحيات كل واحد. حساب كلمة سر الخادم (admin) يبقى المالك الكامل ولا يُحذف.
        </p>
        <div className="mt-6 space-y-3">
          {users.map((u) => (
            <article key={u.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{u.name}</strong>
                <span className="font-mono text-xs" dir="ltr">
                  {u.username}
                </span>
              </div>
              <p className="mt-2 text-xs text-black/55">{u.active === false ? "متوقف" : "مفعّل"}</p>
              <p className="mt-1 text-xs text-black/60">
                {PERMISSIONS.filter((p) => u.permissions?.[p.id]).map((p) => p.ar).join(" · ") || "بدون صلاحيات"}
              </p>
              <div className="mt-3 flex gap-3 text-sm">
                <button type="button" className="font-bold text-medical" onClick={() => startEdit(u)}>
                  تعديل
                </button>
                <button type="button" className="font-bold text-crimson" onClick={() => remove(u.id)}>
                  حذف
                </button>
              </div>
            </article>
          ))}
          {!users.length && <p className="text-black/50">لا يوجد مستخدمون إضافيون بعد. يمكنك الدخول بكلمة سر المالك.</p>}
        </div>
      </section>

      <form onSubmit={save} className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">{editId ? "تعديل مستخدم" : "مستخدم جديد"}</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">الاسم الظاهر</span>
          <input className="input" value={form.name} onChange={(e) => patch("name", e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">اسم الدخول</span>
          <input className="input" dir="ltr" value={form.username} onChange={(e) => patch("username", e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">{editId ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}</span>
          <input
            className="input"
            type="password"
            dir="ltr"
            value={form.password}
            onChange={(e) => patch("password", e.target.value)}
            required={!editId}
            minLength={editId && !form.password ? undefined : 8}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} />
          مفعّل
        </label>
        <div className="space-y-2 rounded-xl bg-mist p-3">
          <p className="text-sm font-bold text-navy">الصلاحيات</p>
          {PERMISSIONS.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.permissions[p.id])} onChange={() => togglePerm(p.id)} />
              {p.ar}
            </label>
          ))}
        </div>
        {error && <p className="text-sm font-bold text-crimson">{error}</p>}
        {saved && <p className="text-sm font-bold text-medical">{saved}</p>}
        <div className="flex gap-3">
          <button disabled={busy} className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "جاري الحفظ..." : "حفظ"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="rounded-full bg-mist px-5 py-2.5 text-sm font-bold text-navy">
              إلغاء
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
