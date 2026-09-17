import { useState } from "react";
import { supabase } from "./supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <form
        onSubmit={submit}
        style={{
          width: 320,
          padding: 24,
          borderRadius: 16,
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>עורך אלבומים</h1>
        <p style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 0, marginBottom: 20 }}>
          התחברות עם אותו חשבון photographer-flow
        </p>
        <label style={{ fontSize: 12, color: "var(--color-ink-soft)", display: "block", marginBottom: 4 }}>אימייל</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", marginBottom: 12, fontSize: 14 }}
        />
        <label style={{ fontSize: 12, color: "var(--color-ink-soft)", display: "block", marginBottom: 4 }}>סיסמה</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", marginBottom: 16, fontSize: 14 }}
        />
        {error && <p style={{ color: "var(--color-rose)", fontSize: 12, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: "var(--color-ink)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "מתחבר..." : "התחברות"}
        </button>
      </form>
    </div>
  );
}
