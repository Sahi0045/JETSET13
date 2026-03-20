import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { getApiUrl, apiGet } from "../../../../utils/apiHelper";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 11: Admin Visa Stats & Revenue Dashboard — connected to live API

const StatCard = ({ label, val, grow, icon, color, loading }) => {
  const colorMap = {
    primary: {
      bg: "bg-[#1152d4]/10",
      text: "text-[#1152d4]",
    },
    orange: {
      bg: "bg-orange-500/10",
      text: "text-orange-600",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600",
    },
    blue: {
      bg: "bg-blue-500/10",
      text: "text-blue-600",
    },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div className="bg-white p-5 lg:p-7 rounded-3xl lg:rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all">
      <div className="flex justify-between items-start mb-4 lg:mb-6">
        <span className="text-[9px] lg:text-[10px] font-black text-slate-300 uppercase tracking-widest">
          {label}
        </span>
        <div
          className={`p-2.5 lg:p-3 ${c.bg} ${c.text} rounded-xl lg:rounded-2xl transition-all group-hover:rotate-12`}
        >
          <span className="material-symbols-outlined text-xl lg:text-2xl">
            {icon}
          </span>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-slate-100 rounded-lg animate-pulse w-24" />
          <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
        </div>
      ) : (
        <>
          <p className="text-2xl lg:text-3xl font-black text-slate-900 mb-2 leading-none tracking-tighter">
            {val}
          </p>
          <div className="flex items-center gap-1.5 text-emerald-600 font-black text-[9px] lg:text-[10px] uppercase tracking-widest">
            <span className="material-symbols-outlined text-xs">
              trending_up
            </span>
            <span>{grow}</span>
          </div>
        </>
      )}
    </div>
  );
};

const VisaAdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recentApps, setRecentApps] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiGet("visa/applications/stats");
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load stats.");
      }
      setStats(data.data);
    } catch (err) {
      console.error("VisaAdminDashboard stats error:", err);
      setError(err.message || "Failed to load dashboard stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentApplications = useCallback(async () => {
    setRecentLoading(true);
    try {
      const response = await apiGet("visa/applications?limit=5&orderBy=created_at:desc");
      let data;
      try { data = await response.json(); } catch { return; }
      if (response.ok && data.success) {
        setRecentApps(data.data || []);
      }
    } catch (err) {
      console.error("VisaAdminDashboard recent apps error:", err);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchRecentApplications();

    // ── Real-time Polling (20s) ─────────────────────────────────────────────
    const pollInterval = setInterval(() => {
      fetchStats();
      fetchRecentApplications();
    }, 20000);

    return () => clearInterval(pollInterval);
  }, [fetchStats, fetchRecentApplications]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const appStats = stats?.applications || {};
  const consultStats = stats?.consultations || {};

  const totalApplications = appStats.total ?? 0;
  const pendingReview =
    (appStats.byStatus?.submitted ?? 0) +
    (appStats.byStatus?.documents_pending ?? 0) +
    (appStats.byStatus?.under_review ?? 0);
  const totalRevenue =
    (appStats.totalRevenue ?? 0) + (consultStats.totalRevenue ?? 0);
  const approvedCount = appStats.byStatus?.approved ?? 0;
  const approvalRate =
    totalApplications > 0
      ? ((approvedCount / totalApplications) * 100).toFixed(1)
      : "—";
  const recent30 =
    (appStats.recent30Days ?? 0) + (consultStats.recent30Days ?? 0);

  // ── Bar chart data (by service tier) ────────────────────────────────────
  const tierData = [
    { name: "Standard", val: appStats.byTier?.standard ?? 0 },
    { name: "Express", val: appStats.byTier?.express ?? 0 },
    { name: "Premium", val: appStats.byTier?.premium ?? 0 },
  ];
  const maxTier = Math.max(...tierData.map((t) => t.val), 1);

  // ── Status breakdown ──────────────────────────────────────────────────────
  const STATUS_CONFIG = {
    submitted: { label: "Submitted", color: "bg-blue-500" },
    documents_pending: { label: "Docs Pending", color: "bg-amber-500" },
    under_review: { label: "Under Review", color: "bg-purple-500" },
    additional_info_required: {
      label: "Info Required",
      color: "bg-orange-500",
    },
    approved: { label: "Approved", color: "bg-green-500" },
    rejected: { label: "Rejected", color: "bg-red-500" },
    cancelled: { label: "Cancelled", color: "bg-slate-400" },
    completed: { label: "Completed", color: "bg-emerald-600" },
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="bg-[#f8f9fc] min-h-screen font-sans">
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <div className="p-4 sm:p-6 lg:p-10 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8 lg:mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
              Intelligence Hub
            </h1>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  fetchStats();
                  fetchRecentApplications();
                }}
                disabled={loading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-5 py-2 lg:py-2.5 bg-white border border-slate-100 rounded-xl lg:rounded-2xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-sm ${loading ? "animate-spin" : ""}`}
                >
                  refresh
                </span>
                Refresh
              </button>
              <Link
                to="/visa/admin/applications"
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-5 py-2 lg:py-2.5 bg-[#1152d4] rounded-xl lg:rounded-2xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-[#1152d4]/20 hover:scale-105 transition-all no-underline"
              >
                <span className="material-symbols-outlined text-sm">
                  assignment
                </span>
                All Applications
              </Link>
            </div>
          </div>
          <p className="text-[10px] lg:text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            Real-time visa analytics &amp; revenue flow
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
            <span className="material-symbols-outlined text-xl shrink-0">
              error
            </span>
            <div>
              <p className="font-black text-sm">
                Failed to load dashboard data
              </p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchStats}
              className="ml-auto px-4 py-2 bg-red-100 hover:bg-red-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-8 lg:mb-12">
          <StatCard
            label="Total Applications"
            val={loading ? "—" : totalApplications.toLocaleString()}
            grow={`${recent30} in last 30 days`}
            icon="assignment"
            color="primary"
            loading={loading}
          />
          <StatCard
            label="Pending Reviews"
            val={loading ? "—" : pendingReview.toLocaleString()}
            grow={`${appStats.byStatus?.under_review ?? 0} under review`}
            icon="pending_actions"
            color="orange"
            loading={loading}
          />
          <StatCard
            label="Total Revenue"
            val={loading ? "—" : formatCurrency(totalRevenue)}
            grow={`${formatCurrency(appStats.pendingRevenue ?? 0)} pending`}
            icon="payments"
            color="emerald"
            loading={loading}
          />
          <StatCard
            label="Approval Rate"
            val={loading ? "—" : `${approvalRate}%`}
            grow={`${approvedCount} approved total`}
            icon="verified"
            color="blue"
            loading={loading}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-8 lg:mb-12">
          {/* Service Tier Chart */}
          <div className="lg:col-span-2 bg-white p-6 lg:p-10 rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 lg:mb-12">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1.5">
                  Applications by Service Tier
                </h3>
                <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Breakdown of processing tiers selected
                </p>
              </div>
              <Link
                to="/visa/admin/applications"
                className="text-[10px] font-black text-[#1152d4] uppercase tracking-widest hover:opacity-70 transition-all no-underline flex items-center gap-1"
              >
                View All{" "}
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
              </Link>
            </div>

            {loading ? (
              <div className="h-60 flex items-end justify-between gap-6 px-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-4"
                  >
                    <div
                      className="w-full bg-slate-100 rounded-2xl animate-pulse"
                      style={{ height: `${30 + i * 20}%` }}
                    />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-60 lg:h-72 flex items-end justify-between gap-4 lg:gap-10 px-0 lg:px-4">
                {tierData.map((t) => {
                  const heightPct =
                    maxTier > 0 ? Math.max((t.val / maxTier) * 100, 4) : 4;
                  return (
                    <div
                      key={t.name}
                      className="flex-1 flex flex-col items-center gap-4 lg:gap-6 group"
                    >
                      <div className="w-full flex flex-col items-center gap-2">
                        {t.val > 0 && (
                          <span className="text-xs font-black text-slate-700 opacity-0 group-hover:opacity-100 transition-all">
                            {t.val}
                          </span>
                        )}
                        <div
                          className="w-full bg-[#1152d4]/10 hover:bg-[#1152d4] transition-all duration-500 rounded-lg lg:rounded-2xl shadow-inner relative"
                          style={{
                            height: `${heightPct * 1.8}px`,
                            minHeight: "8px",
                          }}
                        >
                          {t.val === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[10px] font-black text-slate-300">
                                0
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight lg:tracking-widest">
                        {t.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status Breakdown */}
          <div className="bg-white p-6 lg:p-10 rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-6 lg:mb-8">
              Status Breakdown
            </h3>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 animate-pulse"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200 shrink-0" />
                    <div className="flex-1 h-3 bg-slate-100 rounded" />
                    <div className="w-6 h-3 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 lg:space-y-5">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const count = appStats.byStatus?.[key] ?? 0;
                  if (count === 0) return null;
                  const pct =
                    totalApplications > 0
                      ? Math.round((count / totalApplications) * 100)
                      : 0;
                  return (
                    <div key={key} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.color}`}
                          />
                          <span className="text-[10px] lg:text-[11px] font-black text-slate-700 uppercase tracking-wider">
                            {cfg.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${cfg.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {!loading && totalApplications === 0 && (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-4xl text-slate-200 block mb-2">
                      assignment
                    </span>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      No applications yet
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Consultation stats */}
            {!loading && consultStats.total > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-4">
                  Consultations
                </p>
                <div className="space-y-2">
                  {Object.entries(consultStats.byStatus || {}).map(
                    ([key, count]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="font-medium text-slate-500 capitalize">
                          {key}
                        </span>
                        <span className="font-black text-slate-700">
                          {count}
                        </span>
                      </div>
                    ),
                  )}
                  <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="font-black text-slate-700">
                      Total Consultations
                    </span>
                    <span className="font-black text-[#1152d4]">
                      {consultStats.total}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Revenue Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8 lg:mb-12">
            {[
              {
                label: "App Revenue (Collected)",
                val: formatCurrency(appStats.totalRevenue ?? 0),
                icon: "payments",
                note: "Paid applications",
              },
              {
                label: "Pending Revenue",
                val: formatCurrency(appStats.pendingRevenue ?? 0),
                icon: "hourglass_top",
                note: "Awaiting payment",
              },
              {
                label: "Consultation Revenue",
                val: formatCurrency(consultStats.totalRevenue ?? 0),
                icon: "videocam",
                note: "Confirmed & completed",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30 p-6 flex items-center gap-5"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#1152d4]/5 text-[#1152d4] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-3xl">
                    {item.icon}
                  </span>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">
                    {item.label}
                  </p>
                  <p className="text-2xl font-black text-slate-900 leading-none">
                    {item.val}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    {item.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Applications Table */}
        <div className="bg-white rounded-3xl lg:rounded-[3rem] border border-white shadow-2xl shadow-slate-200/30 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Recent Applications
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Last 5 submitted applications
              </p>
            </div>
            <Link
              to="/visa/admin/applications"
              className="flex items-center gap-2 text-[10px] font-black text-[#1152d4] uppercase tracking-widest hover:opacity-70 transition-all no-underline justify-center sm:justify-start"
            >
              <span className="material-symbols-outlined text-lg">list</span>
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px] lg:min-w-full">
              <thead className="bg-slate-50/50 text-slate-300 text-[8px] lg:text-[9px] font-black uppercase tracking-widest border-b border-slate-50">
                <tr>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Reference</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Applicant</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Destination</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Service Tier</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Status</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5">Date</th>
                  <th className="px-6 lg:px-8 py-4 lg:py-5 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-4 bg-slate-100 rounded w-32" />
                      </td>
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-4 bg-slate-100 rounded w-28" />
                      </td>
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-4 bg-slate-100 rounded w-24" />
                      </td>
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-4 bg-slate-100 rounded w-20" />
                      </td>
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                      </td>
                      <td className="px-6 lg:px-8 py-4">
                        <div className="h-4 bg-slate-100 rounded w-20" />
                      </td>
                      <td className="px-6 lg:px-8 py-4 text-right">
                        <div className="h-4 bg-slate-100 rounded w-12 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : recentApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-16 text-center">
                      <span className="material-symbols-outlined text-4xl text-slate-200 block mb-3">
                        assignment
                      </span>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
                        No applications yet
                      </p>
                    </td>
                  </tr>
                ) : (
                  recentApps.map((app) => {
                    const statusCfg =
                      STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
                    const applicantName = app.personal_info
                      ? `${app.personal_info.firstName || ""} ${app.personal_info.lastName || ""}`.trim()
                      : "—";
                    return (
                      <tr
                        key={app.id}
                        className="hover:bg-slate-50/50 transition-all group"
                      >
                        <td className="px-6 lg:px-8 py-4 lg:py-5">
                          <span className="font-mono font-black text-[#1152d4] text-[11px] bg-[#1152d4]/5 px-2 py-1 rounded-md">
                            {app.application_ref}
                          </span>
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5">
                          <p className="text-[11px] font-black text-slate-900 truncate max-w-[140px]">
                            {applicantName || app.personal_info?.email || "—"}
                          </p>
                          {app.personal_info?.email && (
                            <p className="text-[10px] font-bold text-slate-400 truncate max-w-[140px]">
                              {app.personal_info.email}
                            </p>
                          )}
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5 text-[11px] font-bold text-slate-700 truncate max-w-[120px]">
                          {app.travel_details?.destination || "—"}
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 capitalize">
                            {app.service_tier || "—"}
                          </span>
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.color}`}
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                              {statusCfg.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5 text-[11px] font-bold text-slate-400">
                          {formatDate(app.created_at)}
                        </td>
                        <td className="px-6 lg:px-8 py-4 lg:py-5 text-right">
                          <Link
                            to={`/visa/admin/applications/${app.id}`}
                            className="text-[10px] font-black text-[#1152d4] uppercase tracking-widest hover:underline no-underline opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Review →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisaAdminDashboard;
