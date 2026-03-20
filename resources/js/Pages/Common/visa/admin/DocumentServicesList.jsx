import React, { useState, useEffect, useCallback, useRef } from "react";
import { getApiUrl } from "../../../../utils/apiHelper";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - Document Services List — connected to live API (stored as consultations)

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800" },
  confirmed: { label: "In Progress", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-600" },
};

const URGENCY_BADGE = {
  "Same Day": "bg-red-100 text-red-700",
  "Express (1-2 days)": "bg-amber-100 text-amber-700",
  "Standard (3-5 days)": "bg-slate-100 text-slate-600",
  default: "bg-slate-100 text-slate-600",
};

const PAGE_SIZE = 15;

/**
 * Extracts a clean service label from the consultant_role field.
 * Document service consultations are stored with the service title as the
 * consultant_role and "Document Services Team" as the consultant_name.
 */
const getServiceLabel = (consultation) =>
  consultation.consultant_role || "Document Service";

/**
 * Maps booking_time (which holds the urgency string) to a readable label
 * and badge color.
 */
const getUrgencyInfo = (consultation) => {
  const raw = consultation.booking_time || "";
  const color = URGENCY_BADGE[raw] || URGENCY_BADGE.default;
  const label = raw || "Standard";
  return { label, color };
};

/**
 * Extracts the first line of the notes field as a brief summary.
 */
const getNotesSummary = (consultation) => {
  if (!consultation.notes) return "—";
  const lines = consultation.notes.split("\n").filter(Boolean);
  return lines[0] || "—";
};

const DocumentServicesList = () => {
  const [services, setServices] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusCounts, setStatusCounts] = useState({});

  // Modal state
  const [showUpdateModal, setShowUpdateModal] = useState(null); // holds the consultation object
  const [newStatus, setNewStatus] = useState("");
  const [modalUpdating, setModalUpdating] = useState(false);
  const [modalError, setModalError] = useState("");

  // Notes modal
  const [showNotesModal, setShowNotesModal] = useState(null);

  const searchTimeout = useRef(null);

  // ── Fetch document service consultations ────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      // Filter by consultant_name to only show document service requests
      params.set("consultantName", "Document Services Team");
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((currentPage - 1) * PAGE_SIZE));
      params.set("orderBy", "created_at:desc");

      const response = await fetch(
        `${getApiUrl("visa/consultations")}?${params.toString()}`,
        {
          headers: { Accept: "application/json" },
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch document services.");
      }

      // Apply client-side search filter on customer name or service label
      let rows = data.data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        rows = rows.filter(
          (s) =>
            (s.customer_name || "").toLowerCase().includes(q) ||
            (s.customer_email || "").toLowerCase().includes(q) ||
            (s.consultant_role || "").toLowerCase().includes(q) ||
            (s.id || "").toLowerCase().includes(q),
        );
      }

      setServices(rows);
      setTotal(data.total || rows.length);

      // Build status counts from current page data (approximate)
      const counts = {};
      (data.data || []).forEach((s) => {
        counts[s.status] = (counts[s.status] || 0) + 1;
      });
      setStatusCounts(counts);
    } catch (err) {
      console.error("DocumentServicesList fetch error:", err);
      setError(err.message || "An error occurred while loading requests.");
      setServices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, currentPage]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // ── Debounced search ───────────────────────────────────────────────────────
  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(val);
      setCurrentPage(1);
    }, 400);
  };

  // ── Status update ──────────────────────────────────────────────────────────
  const handleStatusUpdate = async () => {
    if (!showUpdateModal || !newStatus) return;
    setModalUpdating(true);
    setModalError("");
    try {
      const response = await fetch(
        `${getApiUrl("visa/consultations")}/${showUpdateModal.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update status.");
      }
      // Optimistically update local state
      setServices((prev) =>
        prev.map((s) =>
          s.id === showUpdateModal.id ? { ...s, status: newStatus } : s,
        ),
      );
      setShowUpdateModal(null);
      setNewStatus("");
    } catch (err) {
      console.error("DocumentServicesList status update error:", err);
      setModalError(err.message || "Failed to update status.");
    } finally {
      setModalUpdating(false);
    }
  };

  // ── Cancel request ─────────────────────────────────────────────────────────
  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this service request?")) return;
    try {
      const response = await fetch(
        `${getApiUrl("visa/consultations")}/${id}/cancel`,
        {
          method: "PATCH",
          headers: { Accept: "application/json" },
          credentials: "include",
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to cancel request.");
      }
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)),
      );
    } catch (err) {
      console.error("DocumentServicesList cancel error:", err);
      alert(err.message || "Failed to cancel request.");
    }
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusFilter = (key) => {
    setStatusFilter(key);
    setCurrentPage(1);
  };

  // ── Format date ────────────────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // ── Total in current filter ────────────────────────────────────────────────
  const totalFiltered =
    statusFilter === "all"
      ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
      : (statusCounts[statusFilter] ?? 0);

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 lg:mb-10">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Document Services
            </h1>
            <p className="text-slate-400 text-xs lg:text-sm font-medium mt-1">
              {loading ? (
                <span className="inline-block h-3 w-40 bg-slate-200 rounded animate-pulse" />
              ) : (
                `${total.toLocaleString()} service request${total !== 1 ? "s" : ""} total`
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-80 group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-[#1152d4]">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchInput}
                className="w-full rounded-xl border border-slate-200 bg-white h-11 pl-10 pr-10 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all shadow-sm placeholder:text-slate-400"
                placeholder="Search by customer, email, or service..."
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">
                    close
                  </span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                fetchServices();
              }}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 shrink-0"
            >
              <span
                className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}
              >
                refresh
              </span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700">
            <span className="material-symbols-outlined text-xl shrink-0 mt-0.5">
              error
            </span>
            <div>
              <p className="font-black text-sm">Failed to load requests</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchServices}
              className="ml-auto px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 -mx-1 px-1 scrollbar-none sm:overflow-visible sm:pb-0 sm:flex-wrap">
          <button
            onClick={() => handleStatusFilter("all")}
            className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all shrink-0 ${
              statusFilter === "all"
                ? "bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/20"
                : "bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            }`}
          >
            All Requests
            {!loading && (
              <span className="ml-1.5 opacity-75">
                ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})
              </span>
            )}
          </button>

          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => handleStatusFilter(key)}
                className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all shrink-0 ${
                  statusFilter === key
                    ? "bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/20"
                    : "bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cfg.label}
                {!loading && count > 0 && (
                  <span className="ml-1.5 opacity-75">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50/50 text-slate-300 text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-b border-slate-50">
                  <th className="text-left px-6 py-5">Reference</th>
                  <th className="text-left px-6 py-5">Customer</th>
                  <th className="text-left px-6 py-5">Service Type</th>
                  <th className="text-left px-6 py-5">Processing</th>
                  <th className="text-left px-6 py-5">Status</th>
                  <th className="text-left px-6 py-5">Fee</th>
                  <th className="text-left px-6 py-5">Requested</th>
                  <th className="text-left px-6 py-5">Notes</th>
                  <th className="text-right px-6 py-5">Actions</th>
                </tr>
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <div className="h-5 bg-slate-100 rounded-md w-32 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1.5">
                          <div className="h-3.5 bg-slate-100 rounded w-28 animate-pulse" />
                          <div className="h-2.5 bg-slate-100 rounded w-36 animate-pulse" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-32 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-24 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-12 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-20 animate-pulse" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-32 animate-pulse" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="h-3.5 bg-slate-100 rounded w-14 ml-auto animate-pulse" />
                      </td>
                    </tr>
                  ))}

                {/* Actual rows */}
                {!loading &&
                  services.map((svc) => {
                    const statusCfg =
                      STATUS_CONFIG[svc.status] || STATUS_CONFIG.pending;
                    const { label: urgLabel, color: urgColor } =
                      getUrgencyInfo(svc);
                    const notesSummary = getNotesSummary(svc);

                    return (
                      <tr
                        key={svc.id}
                        className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors group"
                      >
                        {/* Reference */}
                        <td className="px-6 py-4">
                          <span className="font-mono font-black text-[#1152d4] text-[11px] bg-[#1152d4]/5 px-2 py-1 rounded-md">
                            {svc.id.slice(0, 8).toUpperCase()}…
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="px-6 py-4">
                          <p className="font-black text-slate-900 text-[13px] truncate max-w-[160px]">
                            {svc.customer_name || "—"}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 truncate max-w-[160px]">
                            {svc.customer_email || "—"}
                          </p>
                        </td>

                        {/* Service type */}
                        <td className="px-6 py-4 font-black text-slate-700 text-[13px] truncate max-w-[160px]">
                          {getServiceLabel(svc)}
                        </td>

                        {/* Urgency / Processing */}
                        <td className="px-6 py-4">
                          <span
                            className={`${urgColor} text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest whitespace-nowrap`}
                          >
                            {urgLabel}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span
                            className={`${statusCfg.color} text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest whitespace-nowrap`}
                          >
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Fee */}
                        <td className="px-6 py-4 font-black text-slate-900 text-sm">
                          {svc.amount != null ? `$${svc.amount}` : "—"}
                        </td>

                        {/* Date */}
                        <td className="px-6 py-4 text-[11px] font-bold text-slate-400">
                          {formatDate(svc.created_at)}
                        </td>

                        {/* Notes (truncated) */}
                        <td className="px-6 py-4">
                          {notesSummary !== "—" ? (
                            <button
                              onClick={() => setShowNotesModal(svc)}
                              className="text-[11px] font-medium text-slate-500 hover:text-[#1152d4] transition-colors text-left max-w-[160px] truncate block"
                              title="Click to view full notes"
                            >
                              {notesSummary}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300 font-bold">
                              —
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {svc.status !== "cancelled" && (
                              <button
                                onClick={() => {
                                  setShowUpdateModal(svc);
                                  setNewStatus(svc.status);
                                  setModalError("");
                                }}
                                className="text-[#1152d4] text-[10px] font-black uppercase tracking-widest hover:underline whitespace-nowrap"
                              >
                                Update
                              </button>
                            )}
                            {svc.status !== "cancelled" &&
                              svc.status !== "completed" && (
                                <button
                                  onClick={() => handleCancel(svc.id)}
                                  className="text-red-400 text-[10px] font-black uppercase tracking-widest hover:underline whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {!loading && services.length === 0 && !error && (
            <div className="p-20 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-200 block mb-3">
                folder_open
              </span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : statusFilter !== "all"
                    ? `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} requests`
                    : "No document service requests yet"}
              </p>
              {(searchQuery || statusFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setStatusFilter("all");
                    setCurrentPage(1);
                  }}
                  className="mt-4 px-5 py-2 bg-[#1152d4] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-md"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* Pagination */}
          {!loading && total > PAGE_SIZE && (
            <div className="px-6 lg:px-8 py-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Showing{" "}
                <span className="text-slate-700">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, total)}
                </span>{" "}
                of{" "}
                <span className="text-slate-700">{total.toLocaleString()}</span>
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-[#1152d4] hover:border-[#1152d4]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">
                    chevron_left
                  </span>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - currentPage) <= 2,
                  )
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dot-${i}`}
                        className="text-slate-400 text-xs font-black px-1"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        disabled={loading}
                        className={`h-9 w-9 rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50 ${
                          currentPage === p
                            ? "bg-[#1152d4] text-white ring-4 ring-[#1152d4]/10 shadow-lg shadow-[#1152d4]/20"
                            : "border border-slate-200 bg-white text-slate-500 hover:text-[#1152d4] hover:border-[#1152d4]/30"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}

                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages || loading}
                  className="h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-[#1152d4] hover:border-[#1152d4]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Update Status Modal ─────────────────────────────────────────────── */}
      {showUpdateModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => !modalUpdating && setShowUpdateModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm p-8 lg:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-3">
              <span className="p-2.5 bg-[#1152d4]/5 text-[#1152d4] rounded-xl">
                <span className="material-symbols-outlined">edit</span>
              </span>
              Service Update
            </h3>

            {/* Request summary */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Service Request
              </p>
              <p className="text-sm font-black text-slate-900">
                <span className="text-[#1152d4]">
                  {getServiceLabel(showUpdateModal)}
                </span>
              </p>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                {showUpdateModal.customer_name || "—"} ·{" "}
                {showUpdateModal.customer_email || "—"}
              </p>
            </div>

            {/* Error */}
            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                <span className="material-symbols-outlined text-sm">error</span>
                {modalError}
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-1">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 h-12 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => !modalUpdating && setShowUpdateModal(null)}
                  disabled={modalUpdating}
                  className="py-4 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={modalUpdating || !newStatus}
                  className="py-4 bg-[#1152d4] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {modalUpdating ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Updating…
                    </>
                  ) : (
                    "Apply Update"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes Detail Modal ──────────────────────────────────────────────── */}
      {showNotesModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setShowNotesModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 lg:p-10 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  Request Details
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {getServiceLabel(showNotesModal)} ·{" "}
                  {showNotesModal.customer_name || "—"}
                </p>
              </div>
              <button
                onClick={() => setShowNotesModal(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700 shrink-0"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Service details grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                {
                  label: "Customer",
                  value: showNotesModal.customer_name || "—",
                },
                {
                  label: "Email",
                  value: showNotesModal.customer_email || "—",
                },
                {
                  label: "Service",
                  value: getServiceLabel(showNotesModal),
                },
                {
                  label: "Processing",
                  value: showNotesModal.booking_time || "Standard",
                },
                {
                  label: "Amount",
                  value:
                    showNotesModal.amount != null
                      ? `$${showNotesModal.amount}`
                      : "—",
                },
                {
                  label: "Status",
                  value:
                    STATUS_CONFIG[showNotesModal.status]?.label ||
                    showNotesModal.status,
                },
                {
                  label: "Date",
                  value: formatDate(showNotesModal.created_at),
                },
                {
                  label: "Booking Date",
                  value: showNotesModal.booking_date || "—",
                },
              ].map((item, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    {item.label}
                  </p>
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Full notes */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Full Request Notes
              </p>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {showNotesModal.notes || "No additional notes provided."}
                </pre>
              </div>
            </div>

            <button
              onClick={() => setShowNotesModal(null)}
              className="w-full mt-6 py-3 bg-[#1152d4] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-[#0e42b0] transition-all shadow-lg shadow-[#1152d4]/20"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentServicesList;
