"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi, type IAdminUserSummary } from "@/lib/api";

// ── Confirmation modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmClassName,
  onConfirm,
  onCancel,
  busy,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-7 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-6">{description}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${confirmClassName}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  // Danger zone state
  type DangerAction = "delete" | "wipe" | null;
  const [dangerAction, setDangerAction] = useState<DangerAction>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerError, setDangerError] = useState("");

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

  // ── Danger zone handlers ─────────────────────────────────────────────────────

  const handleDangerConfirm = async () => {
    if (!id || !dangerAction) return;
    setDangerBusy(true);
    setDangerError("");
    try {
      if (dangerAction === "delete") {
        await adminApi.deleteUser(id);
        // Navigate away — user no longer exists
        router.push("/admin/users");
      } else {
        const res = await adminApi.wipeUserData(id);
        setDangerAction(null);
        // Reload user so token bar resets to 0
        await load();
        setSuccess(res.message);
      }
    } catch (e) {
      setDangerError(e instanceof Error ? e.message : "Action failed.");
      setDangerAction(null);
    } finally {
      setDangerBusy(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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
      {/* Confirmation modal overlay */}
      {dangerAction && (
        <ConfirmModal
          title={
            dangerAction === "delete"
              ? "Permanently Delete User?"
              : "Wipe All User Data?"
          }
          description={
            dangerAction === "delete"
              ? `This will permanently delete "${user.name}" (${user.email}) and ALL of their data — persona, suggestions, drafts, chat sessions, token logs, and more. This action cannot be undone.`
              : `This will delete all data for "${user.name}" (${user.email}) including their persona, suggestions, drafts, chat sessions, and token logs. Their account credentials (name, email, password) will be preserved and their token counter reset to 0. This action cannot be undone.`
          }
          confirmLabel={dangerAction === "delete" ? "Yes, Delete Forever" : "Yes, Wipe Data"}
          confirmClassName={
            dangerAction === "delete"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-amber-600 hover:bg-amber-700"
          }
          onConfirm={() => void handleDangerConfirm()}
          onCancel={() => setDangerAction(null)}
          busy={dangerBusy}
        />
      )}

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
      {dangerError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {dangerError}
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

      {/* ── Danger Zone ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">⚠️</span>
          <h2 className="text-base font-semibold text-red-800">Danger Zone</h2>
        </div>
        <p className="text-xs text-red-600 mb-5">
          These actions are irreversible. Use with extreme caution.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Wipe Data */}
          <div className="bg-white rounded-lg border border-amber-200 p-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              🧹 Wipe User Data
            </h3>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Deletes all of this user&apos;s content — persona, suggestions,
              drafts, chat sessions, token logs, and feedback. Their account
              (name, email, password) is preserved and their token counter
              resets to&nbsp;0.
            </p>
            <button
              onClick={() => setDangerAction("wipe")}
              className="w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              Wipe All Data
            </button>
          </div>

          {/* Delete User */}
          <div className="bg-white rounded-lg border border-red-200 p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              🗑️ Delete User
            </h3>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Permanently deletes this user&apos;s account <strong>and</strong>{" "}
              all related data — persona, suggestions, drafts, chat sessions,
              token logs, and more. The account cannot be recovered.
            </p>
            <button
              onClick={() => setDangerAction("delete")}
              className="w-full rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 transition-colors"
            >
              Delete User Forever
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
