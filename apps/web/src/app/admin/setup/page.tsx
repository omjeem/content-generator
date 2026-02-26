"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";

/**
 * One-time admin setup page.
 *
 * The admin account is seeded on startup with a placeholder email and a random
 * password (unusable). A setup token is printed to the server logs.
 *
 * The admin visits this page, enters the setup token + their chosen email +
 * password, then can log in normally.
 *
 * Route: /admin/setup
 * Access: Requires the user to be authenticated (any role) — the API checks
 *         the JWT token on POST /api/admin-setup, but does NOT require admin role.
 */
export default function AdminSetupPage() {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      await adminApi.setup({
        setupToken: setupToken.trim(),
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      setDone(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed. Check your setup token.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md w-full rounded-xl bg-green-50 border border-green-200 p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-green-800 mb-2">
            Setup Complete!
          </h1>
          <p className="text-sm text-green-700">
            Your admin account is ready. Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Setup</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete your admin account setup using the token printed in the
            server logs.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Setup Token{" "}
              <span className="text-gray-400 font-normal">(from server logs)</span>
            </label>
            <input
              type="text"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              required
              placeholder="64-character hex token"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Admin"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@yourcompany.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password{" "}
              <span className="text-xs text-gray-400">(min 12 chars)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Setting up…" : "Complete Setup →"}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400">
          Already set up?{" "}
          <a href="/login" className="text-indigo-600 hover:underline">
            Go to Login
          </a>
        </p>
      </div>
    </div>
  );
}
