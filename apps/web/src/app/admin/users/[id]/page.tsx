"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi, type IAdminUserSummary } from "@/lib/api";

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<IAdminUserSummary | null>(null);
  const [persona, setPersona] = useState<Record<string, unknown> | null>(null);
  const [recentLogs, setRecentLogs] = useState<
    { agent: string; operation: string; totalTokens: number; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [tokenLimit, setTokenLimit] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getUser(id);
      setUser(res.user);
      setPersona(res.persona);
      setRecentLogs(res.recentLogs ?? []);
      setName(res.user.name);
      setRole(res.user.role);
      setTokenLimit(
        res.user.tokenLimit !== null ? String(res.user.tokenLimit) : "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!user || !id) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body: Parameters<typeof adminApi.updateUser>[1] = {};
      if (name !== user.name) body.name = name;
      if (role !== user.role) body.role = role;
      const limitVal = tokenLimit === "" ? null : parseInt(tokenLimit);
      if (limitVal !== user.tokenLimit) body.tokenLimit = limitVal;

      if (Object.keys(body).length === 0) {
        setSuccess("No changes to save.");
        return;
      }
      const res = await adminApi.updateUser(id, body);
      setUser(res.user);
      setSuccess("User updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-sm text-red-600">
        {error || "User not found."}
      </div>
    );
  }

  const usedPct = Math.min(
    100,
    Math.round(
      (user.tokensUsed / (user.tokenLimit ?? 100_000)) * 100,
    ),
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
        <span className="text-sm text-gray-500">{user.email}</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Edit panel ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Edit User</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "admin")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Token Limit Override{" "}
              <span className="text-gray-400">(leave blank = use default)</span>
            </label>
            <input
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(e.target.value)}
              placeholder="e.g. 200000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

        {/* ── Token usage ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Token Usage</h2>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">
                {user.tokensUsed.toLocaleString()} used
              </span>
              <span className="text-gray-400">
                {(user.tokenLimit ?? 100_000).toLocaleString()} limit
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usedPct >= 100
                    ? "bg-red-500"
                    : usedPct >= 80
                      ? "bg-amber-500"
                      : "bg-indigo-500"
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{usedPct}% of limit</p>
          </div>

          {/* Recent logs */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Recent Operations
            </p>
            {recentLogs.length === 0 ? (
              <p className="text-xs text-gray-400">No logs yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recentLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-xs"
                  >
                    <span className="text-gray-600">
                      {log.operation.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-400 tabular-nums">
                      {log.totalTokens.toLocaleString()} tokens
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Persona summary ────────────────────────────────────────────────── */}
      {persona && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Persona Summary
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["Industry", persona["industry"]],
                ["Goals", Array.isArray(persona["goals"]) ? (persona["goals"] as string[]).join(", ") : persona["goals"]],
                [
                  "Content Pillars",
                  Array.isArray(persona["contentPillars"])
                    ? (persona["contentPillars"] as string[]).join(", ")
                    : persona["contentPillars"],
                ],
                ["Interview Complete", persona["interviewComplete"] ? "Yes" : "No"],
              ] as [string, unknown][]
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="text-gray-900 font-medium truncate">
                  {String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
