import { useState } from "react";
import Logo from "../components/Logo";

interface Props {
  onLogin: () => void;
}

export default function LoginView({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[320px] flex flex-col gap-6">
        <div className="flex justify-center">
          <Logo size="md" />
        </div>
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded p-6 flex flex-col gap-4">
          <h1 className="text-text font-semibold text-base m-0">Sign in</h1>
          <div className="flex flex-col gap-1">
            <label className="text-[0.75rem] font-medium text-text-3">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-surface-deep text-text text-sm border border-border rounded-sm px-3 py-2 outline-none focus:border-accent"
              placeholder="Enter password"
            />
          </div>
          {error && (
            <p className="text-[0.8125rem] text-red m-0">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className={[
              "px-4 py-2 rounded-sm border text-[0.8125rem] font-medium",
              loading || !password
                ? "border-border text-text-3 cursor-not-allowed bg-transparent"
                : "border-border-accent bg-accent-bg text-accent cursor-pointer",
            ].join(' ')}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
