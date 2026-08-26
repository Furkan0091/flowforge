import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Workflow } from "lucide-react";
import { useAuth } from "../store/auth";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">FlowForge</h1>
            <p className="text-xs text-zinc-500">Visual Workflow Automation</p>
          </div>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-6">
          <h2 className="text-sm font-semibold text-zinc-200">Sign in</h2>
          {error && <p className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</p>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-zinc-500">
            No account?{" "}
            <Link to="/register" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Demo account: <span className="font-mono text-zinc-500">demo@flowforge.app</span> /{" "}
          <span className="font-mono text-zinc-500">flowforge123</span>
        </p>
        <p className="mt-3 text-center">
          <Link to="/case-study" className="text-xs text-zinc-500 underline-offset-2 hover:text-accent hover:underline">
            Read the engineering case study
          </Link>
        </p>
      </div>
    </div>
  );
}
