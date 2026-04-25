import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getApiUrl, apiGet } from "../../../../utils/apiHelper";
import { useVisaRealtime } from "../../../../hooks/useVisaRealtime";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - All Visa Applications List — connected to live API

const STATUS_CONFIG = {
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  documents_pending: {
    label: "Docs Pending",
    color: "bg-amber-100 text-amber-800",
  },
  under_review: {
    label: "Under Review",
    color: "bg-purple-100 text-purple-800",
  },
  additional_info_required: {
    label: "Info Needed",
    color: "bg-orange-100 text-orange-800",
  },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-600" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-800" },
};

const PRIORITY_CONFIG = {
  low: { label: "Low", dot: "bg-slate-300" },
  normal: { label: "Normal", dot: "bg-blue-400" },
  high: { label: "High", dot: "bg-amber-500" },
  urgent: { label: "Urgent", dot: "bg-red-500" },
};

const PAGE_SIZE = 15;

const VisaApplicationsList = () => {
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedApps, setSelectedApps] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusCounts, setStatusCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(true);

  const searchTimeout = useRef(null);

  // ── Fetch applications ────────────────────────────────────────────────────
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelectedApps([]);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery) params.set("destination", searchQuery);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((currentPage - 1) * PAGE_SIZE));
      params.set("orderBy", "created_at:desc");

      const response = await apiGet(`visa/applications?${params.toString()}`);

      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch applications.");
      }

      setApplications(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("VisaApplicationsList fetch error:", err);
      setError(err.message || "An error occurred while loading applications.");
      setApplications([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, currentPage]);

  // ── Fetch status counts for filter tabs ──────────────────────────────────
  const fetchStatusCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const response = await apiGet("visa/applications/stats");
      let data;
      try { data = await response.json(); } catch { return; }
      if (response.ok && data.success) {
        setStatusCounts(data.data?.applications?.byStatus || {});
      }
    } catch (err) {
      console.error("VisaApplicationsList counts error:", err);
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatusCounts();
  }, [fetchStatusCounts]);

useEffect(() => {
    fetchStatusCounts();
  }, [fetchStatusCounts]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useVisaRealtime({
    tables: ['visa_applications'],
    onApplicationUpdate: () => {
      fetchApplications();
      fetchStatusCounts();
    },
    getDataFn: fetchApplications,
    fetchOnMount: false,
    fallbackPollingMs: 20000
  });

  useVisaRealtime({
    tables: ['visa_applications'],
    onApplicationUpdate: () => {
      fetchApplications();
      fetchStatusCounts();
    },
    getDataFn: fetchApplications,
    fetchOnMount: false,
    fallbackPollingMs: 20000
  });

  // ── Debounced search ──────────────────────────────────────────────────────
  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(val);
      setCurrentPage(1);
    }, 400);
  };

  // ── Pagination helpers ────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusFilter = (key) => {
    setStatusFilter(key);
    setCurrentPage(1);
    setSelectedApps([]);
  };

  // ── Row selection ─────────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedApps((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedApps.length === applications.length) {
      setSelectedApps([]);
    } else {
      setSelectedApps(applications.map((a) => a.id));
    }
  };

  // ── Format date ───────────────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // ── Get applicant name from personal_info JSONB ───────────────────────────
  const getApplicantName = (app) => {
    if (!app.personal_info) return "—";
    const fn = app.personal_info.firstName || "";
    const ln = app.personal_info.lastName || "";
    return `${fn} ${ln}`.trim() || "—";
  };

  const getApplicantEmail = (app) => {
    return app.personal_info?.email || "—";
  };

  const getDestination = (app) => {
    return app.travel_details?.destination || "—";
  };

  const getVisaType = (app) => {
    const t = app.travel_details?.visaType || "";
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
  };

  // ── Total in current filter ───────────────────────────────────────────────
  const filterTotal =
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
        {/* Title + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 lg:mb-8">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
              Visa Applications
            </h1>
            <p className="text-slate-500 text-xs lg:text-sm mt-0.5 lg:mt-1 font-medium">
              {loading ? (
                <span className="inline-block h-3 w-28 bg-slate-200 rounded animate-pulse" />
              ) : (
                `${total.toLocaleString()} application${total !== 1 ? "s" : ""} total`
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-96 group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg transition-colors group-focus-within:text-[#1152d4]">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchInput}
                className="w-full rounded-xl border border-slate-200 bg-white h-10 lg:h-11 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[#1152d4]/10 focus:border-[#1152d4]/50 transition-all shadow-sm placeholder:text-slate-400"
                placeholder="Search by destination, name, or email..."
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
                fetchApplications();
                fetchStatusCounts();
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
              <p className="font-black text-sm">Failed to load applications</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchApplications}
              className="ml-auto px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 mb-6 lg:mb-8 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
          <button
            onClick={() => handleStatusFilter("all")}
            className={`px-4 py-2 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm shrink-0 ${
              statusFilter === "all"
                ? "bg-[#1152d4] text-white ring-4 ring-[#1152d4]/10"
                : "bg-white border border-slate-100 text-slate-500 hover:text-[#1152d4] hover:bg-slate-50"
            }`}
          >
            All
            {!countsLoading && (
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
                className={`px-4 py-2 rounded-xl text-[10px] lg:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all shadow-sm shrink-0 ${
                  statusFilter === key
                    ? "bg-[#1152d4] text-white ring-4 ring-[#1152d4]/10"
                    : "bg-white border border-slate-100 text-slate-500 hover:text-[#1152d4] hover:bg-slate-50"
                }`}
              >
                {cfg.label}
                {!countsLoading && count > 0 && (
                  <span className="ml-1.5 opacity-75">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk Actions Bar */}
        {selectedApps.length > 0 && (
          <div className="bg-[#1152d4]/5 border border-[#1152d4]/20 rounded-2xl px-4 lg:px-6 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs lg:text-sm font-black text-[#1152d4] uppercase tracking-widest">
              {selectedApps.length} Selected
            </span>
            <div className="flex flex-wrap gap-2">
              <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                Assign Agent
              </button>
              <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                Change Priority
              </button>
              <button className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                Export CSV
              </button>
              <button
                onClick={() => setSelectedApps([])}
                className="flex-1 sm:flex-none px-3 py-2 bg-white border border-red-200 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all shadow-sm"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-100">
            <table className="w-full text-sm min-w-[1050px]">
              <thead>
                <tr className="bg-slate-50/50 text-slate-300 text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-b border-slate-50">
                  <th className="text-left px-5 lg:px-6 py-4 lg:py-5 w-12">
                    <input
                      type="checkbox"
                      checked={
                        applications.length > 0 &&
                        selectedApps.length === applications.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-[#1152d4] focus:ring-[#1152d4]/20"
                      disabled={loading}
                    />
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Reference
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Applicant
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Destination
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Visa Type
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Status
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Priority
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Service
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Payment
                  </th>
                  <th className="text-left px-4 lg:px-5 py-4 lg:py-5">
                    Submitted
                  </th>
                  <th className="text-right px-4 lg:px-6 py-4 lg:py-5">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="border-t border-slate-100">
                      <td className="px-5 lg:px-6 py-4">
                        <div className="h-4 w-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-4 bg-slate-100 rounded w-32 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="space-y-1.5">
                          <div className="h-3.5 bg-slate-100 rounded w-28 animate-pulse" />
                          <div className="h-2.5 bg-slate-100 rounded w-36 animate-pulse" />
                        </div>
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-24 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-20 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-24 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-16 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-16 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-16 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-5 py-4">
                        <div className="h-3.5 bg-slate-100 rounded w-20 animate-pulse" />
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-right">
                        <div className="h-3.5 bg-slate-100 rounded w-12 ml-auto animate-pulse" />
                      </td>
                    </tr>
                  ))}

                {/* Actual rows */}
                {!loading &&
                  applications.map((app) => {
                    const statusCfg =
                      STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
                    const priorityCfg =
                      PRIORITY_CONFIG[app.priority] || PRIORITY_CONFIG.normal;
                    const isSelected = selectedApps.includes(app.id);

                    return (
                      <tr
                        key={app.id}
                        className={`border-t border-slate-100 hover:bg-slate-50/50 transition-colors ${
                          isSelected ? "bg-[#1152d4]/5" : ""
                        }`}
                      >
                        <td className="px-5 lg:px-6 py-3 lg:py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(app.id)}
                            className="rounded border-slate-300 text-[#1152d4] focus:ring-[#1152d4]/20"
                          />
                        </td>

                        {/* Reference */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4">
                          <Link
                            to={`/visa/admin/applications/${app.id}`}
                            className="font-mono font-bold text-[#1152d4] text-xs hover:underline no-underline"
                          >
                            {app.application_ref}
                          </Link>
                        </td>

                        {/* Applicant */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4">
                          <p className="font-medium text-slate-900 text-sm truncate max-w-[160px]">
                            {getApplicantName(app)}
                          </p>
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">
                            {getApplicantEmail(app)}
                          </p>
                        </td>

                        {/* Destination */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4 text-slate-700 text-sm truncate max-w-[120px]">
                          {getDestination(app)}
                        </td>

                        {/* Visa Type */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4 text-slate-600 text-xs">
                          {getVisaType(app)}
                        </td>

                        {/* Status */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4">
                          <span
                            className={`${statusCfg.color} text-[10px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap`}
                          >
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${priorityCfg.dot}`}
                            />
                            <span className="text-xs font-medium text-slate-600">
                              {priorityCfg.label}
                            </span>
                          </div>
                        </td>

                        {/* Service Tier */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4 text-xs text-slate-600 capitalize">
                          {app.service_tier || "—"}
                        </td>

                        {/* Payment Status */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize whitespace-nowrap ${
                              app.payment_status === "paid"
                                ? "bg-green-100 text-green-700"
                                : app.payment_status === "refunded"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {app.payment_status || "pending"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 lg:px-5 py-3 lg:py-4 text-xs text-slate-500">
                          {formatDate(app.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
                          <Link
                            to={`/visa/admin/applications/${app.id}`}
                            className="text-[#1152d4] text-xs font-bold hover:underline no-underline"
                          >
                            Review →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {!loading && applications.length === 0 && !error && (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">
                search_off
              </span>
              <p className="text-slate-500 text-sm font-bold mb-1">
                No applications found
              </p>
              <p className="text-slate-400 text-xs">
                {searchQuery
                  ? `No results for "${searchQuery}" with the selected filter.`
                  : statusFilter !== "all"
                    ? `No applications with status "${STATUS_CONFIG[statusFilter]?.label}".`
                    : "No visa applications have been submitted yet."}
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

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - currentPage) <= 2,
                  )
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) {
                      acc.push("...");
                    }
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
    </div>
  );
};

export default VisaApplicationsList;
