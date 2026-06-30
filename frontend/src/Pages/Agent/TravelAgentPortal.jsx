import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiUrl } from "../../utils/apiHelper";

function readSession() {
  try {
    const token = localStorage.getItem("adminToken") || localStorage.getItem("token");
    const raw = localStorage.getItem("adminUser") || localStorage.getItem("user");
    const user = raw ? JSON.parse(raw) : null;
    if (!token || !user || user.role !== "agent") return null;
    return { token, user };
  } catch {
    return null;
  }
}

const TYPE_META = {
  flight: { icon: "flight", label: "Flights" },
  hotel: { icon: "hotel", label: "Hotels" },
  cruise: { icon: "directions_boat", label: "Cruises" },
  package: { icon: "luggage", label: "Packages" },
  other: { icon: "sell", label: "Other" },
};
const STATUS_BADGE = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  expired: "bg-slate-100 text-slate-500 ring-slate-200",
};
const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TravelAgentPortal = () => {
  const navigate = useNavigate();
  const session = readSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) { navigate("/admin/login"); return; }
    (async () => {
      try {
        const res = await fetch(getApiUrl("payments?action=agent-stats"), {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const json = await res.json();
        if (res.ok && json.success) setData(json);
        else setError(json.error || "Failed to load your dashboard.");
      } catch (e) {
        setError(e.message || "Failed to load your dashboard.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    ["adminToken", "adminUser", "token", "user", "isAuthenticated"].forEach((k) => localStorage.removeItem(k));
    navigate("/admin/login");
  };

  const agent = data?.agent;
  const s = data?.stats;
  const recent = data?.recentLinks || [];

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans">
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#1152d4] bg-[#1152d4]/5 px-3 py-1.5 rounded-lg border border-[#1152d4]/10 flex items-center gap-1.5 whitespace-nowrap">
              <span className="material-symbols-outlined text-xs">badge</span> Agent Portal
            </span>
            <span className="hidden sm:inline text-xs font-bold text-slate-400 truncate max-w-[180px]">
              {agent?.name || session?.user?.email}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/admin/payment-links/create" className="px-3 py-2 text-[11px] font-bold rounded-lg text-white bg-[#1152d4] hover:bg-[#0e42b0] no-underline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">add</span> <span className="hidden sm:inline">Create Sale</span>
            </Link>
            <Link to="/admin/payment-links" className="px-3 py-2 text-[11px] font-bold rounded-lg text-slate-500 hover:text-[#1152d4] hover:bg-slate-50 no-underline flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">receipt_long</span> <span className="hidden sm:inline">My Sales</span>
            </Link>
            <button onClick={logout} className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">logout</span> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">Welcome back{agent?.name ? `, ${agent.name.split(" ")[0]}` : ""} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">
            Your sales, commission, and recent payment links. Commission rate:{" "}
            <span className="font-bold text-slate-700">{agent ? `${agent.commissionRate}%` : "—"}</span>
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl ring-1 ring-slate-100 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl ring-1 ring-red-200 p-8 text-center text-red-600 text-sm">{error}</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Sales Revenue", value: money(s.totalRevenue), sub: `${s.paidCount} paid`, icon: "payments", tint: "text-emerald-600 bg-emerald-50" },
                { label: "Commission Earned", value: money(s.commissionEarned), sub: "from paid sales", icon: "savings", tint: "text-[#1152d4] bg-[#1152d4]/5" },
                { label: "Pending Commission", value: money(s.commissionPending), sub: `${s.pendingCount} pending`, icon: "hourglass_top", tint: "text-amber-600 bg-amber-50" },
                { label: "Total Sales", value: s.totalLinks, sub: "payment links", icon: "receipt_long", tint: "text-slate-600 bg-slate-100" },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 shadow-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.tint}`}>
                    <span className="material-symbols-outlined text-lg">{c.icon}</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 leading-tight">{c.value}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-1">{c.label}</div>
                  <div className="text-[11px] text-slate-400">{c.sub}</div>
                </div>
              ))}
            </div>

            {/* By type */}
            {s.byType && Object.keys(s.byType).length > 0 && (
              <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-5 mb-6">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 mb-4">Sales by type</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(s.byType).map(([type, v]) => {
                    const m = TYPE_META[type] || TYPE_META.other;
                    return (
                      <div key={type} className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#1152d4]">{m.icon}</span>
                        <div>
                          <div className="font-black text-slate-800">{money(v.revenue)}</div>
                          <div className="text-[11px] text-slate-400">{m.label} · {v.count}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent sales */}
            <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Recent sales</h2>
                <Link to="/admin/payment-links" className="text-xs font-bold text-[#1152d4] hover:underline no-underline">View all →</Link>
              </div>
              {recent.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-sm">
                  No sales yet. <Link to="/admin/payment-links/create" className="text-[#1152d4] font-bold no-underline">Create your first payment link →</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-5 py-3 font-bold">Customer</th>
                        <th className="px-3 py-3 font-bold">Type</th>
                        <th className="px-3 py-3 font-bold text-right">Amount</th>
                        <th className="px-3 py-3 font-bold">Status</th>
                        <th className="px-5 py-3 font-bold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((l) => {
                        const m = TYPE_META[l.booking_type] || TYPE_META.other;
                        return (
                          <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                            <td className="px-5 py-3">
                              <div className="font-bold text-slate-800">{l.customer_name || "—"}</div>
                              <div className="text-slate-400 text-xs">{l.customer_email || ""}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1 text-slate-600">
                                <span className="material-symbols-outlined text-sm">{m.icon}</span> {m.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-slate-800">
                              {l.currency ? `${l.currency} ` : "$"}{Number(l.amount || 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 capitalize ${STATUS_BADGE[l.status] || STATUS_BADGE.expired}`}>{l.status}</span>
                            </td>
                            <td className="px-5 py-3 text-slate-400 text-xs">{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default TravelAgentPortal;
