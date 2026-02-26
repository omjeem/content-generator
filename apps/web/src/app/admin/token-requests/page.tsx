"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi, type IAdminTokenRequest } from "@/lib/api";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default function AdminTokenRequestsPage() {
  const [requests, setRequests] = useState<IAdminTokenRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Inline action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newLimits, setNewLimits] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getTokenRequests(
        statusFilter === "all" ? undefined : statusFilter,
        page,
      );
      setRequests(res.requests);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (
    req: IAdminTokenRequest,
    action: "approve" | "reject",
  ) => {
    setActionLoading(req._id);
    setActionError((prev) => ({ ...prev, [req._id]: "" }));
    try {
      if (action === "approve") {
        const limitStr = newLimits[req._id];
        const newLimit = limitStr ? parseInt(limitStr) : undefined;
        if (!newLimit || newLimit <= 0) {
          setActionError((prev) => ({
            ...prev,
            [req._id]: "Enter a valid new limit.",
          }));
          return;
        }
        await adminApi.updateTokenRequest(req._id, { action: "approve", newLimit });
      } else {
        await adminApi.updateTokenRequest(req._id, { action: "reject" });
      }
      void load();
    } catch (e) {
      setActionError((prev) => ({
        ...prev,
        [req._id]: e instanceof Error ? e.message : "Action failed.",
      }));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Token Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {total.toLocaleString()} total requests
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">
                User
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">
                Current Usage
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">
                Message
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">
                Status
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">
                Submitted
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  Loading…
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No requests found.
                </td>
              </tr>
            ) : (
              requests.map((req) => {
                const user =
                  typeof req.userId === "object"
                    ? req.userId
                    : {
                        email: "Unknown",
                        name: "",
                        tokensUsed: req.tokensUsed,
                        tokenLimit: req.tokenLimit,
                      };
                const isPending = req.status === "pending";
                return (
                  <tr
                    key={req._id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">
                        {user.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
                      {(user.tokensUsed ?? req.tokensUsed).toLocaleString()} /{" "}
                      {(user.tokenLimit ?? req.tokenLimit).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                      {req.message || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={req.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {isPending ? (
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="number"
                            value={newLimits[req._id] ?? ""}
                            onChange={(e) =>
                              setNewLimits((prev) => ({
                                ...prev,
                                [req._id]: e.target.value,
                              }))
                            }
                            placeholder="New limit"
                            className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          <button
                            onClick={() => void handleAction(req, "approve")}
                            disabled={actionLoading === req._id}
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void handleAction(req, "reject")}
                            disabled={actionLoading === req._id}
                            className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                          >
                            Reject
                          </button>
                          {actionError[req._id] && (
                            <span className="text-xs text-red-500">
                              {actionError[req._id]}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-right">
                          {req.newLimit && (
                            <span className="text-xs text-gray-500">
                              → {req.newLimit.toLocaleString()}
                            </span>
                          )}
                          {req.adminNote && (
                            <p className="text-xs text-gray-400 italic">
                              {req.adminNote}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
