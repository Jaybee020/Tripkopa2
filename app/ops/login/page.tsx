"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { loginOperationsAdmin } from "@/lib/api/client";

export default function OperationsLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loginOperationsAdmin({ email, password });
      window.location.assign("/ops/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ops-login-page">
      <section className="ops-login-card">
        <div className="ops-login-brand">
          <span className="ops-brand-mark">t</span>
          <span>tripkopa</span>
        </div>
        <div className="ops-login-icon"><ShieldCheck size={24} /></div>
        <span className="ops-card-kicker">Restricted operations access</span>
        <h1>Admin sign in</h1>
        <p>Use the administrator credentials configured in the deployment environment.</p>
        <form onSubmit={submit} className="ops-login-form">
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <div className="ops-login-error" role="alert">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? <span className="ops-spinner" /> : <LockKeyhole size={16} />}
            {loading ? "Signing in" : "Sign in securely"}
          </button>
        </form>
      </section>
    </main>
  );
}
