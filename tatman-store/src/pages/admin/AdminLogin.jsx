import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.login(password);
      navigate("/admin");
    } catch {
      setError("كلمة المرور غير صحيحة");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4efe6] px-4" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-extrabold">دخول الإدارة</h1>
        <p className="mt-2 text-sm text-black/50">تطمن | Tatman Vet Store</p>
        <input
          type="password"
          className="input mt-6"
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-crimson">{error}</p>}
        <button className="mt-4 min-h-11 w-full rounded-full bg-navy font-bold text-white">دخول</button>
      </form>
    </div>
  );
}
