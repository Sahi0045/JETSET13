import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost, apiPut, apiDelete } from "../../../../utils/apiHelper";

// apiGet/apiPost/apiPut resolve to a raw fetch Response — normalise to { ok, ...json }.
async function send(promise) {
  const res = await promise;
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, ...data };
}

/**
 * Super admin is an allowlisted admin (not a DB role), so we trust the flag the panel stored
 * from the server's /visa/admin/verify response. The backend enforces it on every route too.
 */
function isSuperAdminClient() {
  return localStorage.getItem("visaIsSuperAdmin") === "true";
}

const STATUS_BADGE = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  invited: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled: "bg-slate-100 text-slate-500 ring-slate-200",
};

const EMPTY_FORM = { name: "", email: "", phone: "", specialization: "" };

const VisaAgentsManager = () => {
  const isSuperAdmin = isSuperAdminClient();

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', text }
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);     // agent whose activity is open
  const [activity, setActivity] = useState(null);    // { agent, stats, applications }
  const [activityLoading, setActivityLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await send(apiGet("visa/admin/agents"));
      if (res.ok && res.success) setAgents(res.agents || []);
      else setError(res.message || "Failed to load agents.");
    } catch (e) {
      setError(e.message || "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) load();
    else setLoading(false);
  }, [isSuperAdmin, load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setNotice({ type: "error", text: "Name and email are required." });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await send(
        apiPost("visa/admin/agents", { ...form, returnOrigin: window.location.origin })
      );
      if (res.ok && res.success) {
        setNotice({
          type: res.emailed ? "success" : "error",
          text: res.message,
        });
        setForm(EMPTY_FORM);
        load();
      } else {
        setNotice({ type: "error", text: res.message || "Failed to create agent." });
      }
    } catch (e) {
      setNotice({ type: "error", text: e.message || "Failed to create agent." });
    } finally {
      setSubmitting(false);
    }
  };

  const viewActivity = async (agent) => {
    setViewing(agent); setActivity(null); setActivityLoading(true);
    const res = await send(apiGet(`visa/admin/agents/${agent.id}/activity`));
    setActivityLoading(false);
    if (res.ok && res.success) setActivity(res);
    else setNotice({ type: "error", text: res.message || "Failed to load activity." });
  };

  const setStatus = async (agent, status) => {
    setBusyId(agent.id);
    setNotice(null);
    try {
      const res = await send(apiPut(`visa/admin/agents/${agent.id}`, { status }));
      if (res.ok && res.success) load();
      else setNotice({ type: "error", text: res.message || "Update failed." });
    } catch (e) {
      setNotice({ type: "error", text: e.message || "Update failed." });
    } finally {
      setBusyId(null);
    }
  };

  const removeAgent = async (agent) => {
    const ok = window.confirm(
      `Remove agent "${agent.name || agent.email}"?\n\n` +
        `Their assigned applications will be unassigned and returned to the pool, and they'll lose panel access. ` +
        `This cannot be undone.`
    );
    if (!ok) return;
    setBusyId(agent.id);
    setNotice(null);
    try {
      const res = await send(apiDelete(`visa/admin/agents/${agent.id}`));
      if (res.ok && res.success) {
        setNotice({ type: "success", text: res.message || "Agent removed." });
        load();
      } else {
        setNotice({ type: "error", text: res.message || "Failed to remove agent." });
      }
    } catch (e) {
      setNotice({ type: "error", text: e.message || "Failed to remove agent." });
    } finally {
      setBusyId(null);
    }
  };

  const resendInvite = async (agent) => {
    setBusyId(agent.id);
    setNotice(null);
    try {
      const res = await send(
        apiPost(`visa/admin/agents/${agent.id}/resend-invite`, {
          returnOrigin: window.location.origin,
        })
      );
      setNotice({
        type: res.ok && res.success ? "success" : "error",
        text: res.message || (res.success ? "Invite re-sent." : "Failed to resend."),
      });
    } catch (e) {
      setNotice({ type: "error", text: e.message || "Failed to resend invite." });
    } finally {
      setBusyId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-slate-300 block mb-3">lock</span>
        <h2 className="text-xl font-black text-slate-700 mb-2">Super admin only</h2>
        <p className="text-slate-400 text-sm mb-6">
          Agent management is restricted to the super admin account.
        </p>
        <Link
          to="/visa/admin"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1152d4] text-white rounded-xl font-bold text-sm no-underline"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to panel
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#1152d4]">groups</span>
          Visa Agents
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Add staff who process visa applications. New agents get an email to set their
          password, then see only the applications you assign to them.
        </p>
      </div>

      {notice && (
        <div
          className={`mb-5 rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2 ${
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          <span className="material-symbols-outlined text-base mt-0.5">
            {notice.type === "success" ? "check_circle" : "error"}
          </span>
          <span>{notice.text}</span>
        </div>
      )}

      {/* Add agent */}
      <form
        onSubmit={handleCreate}
        className="bg-white rounded-2xl ring-1 ring-slate-200 p-5 mb-6 shadow-sm"
      >
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 mb-4">
          Add a new agent
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name *"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            type="email"
            placeholder="Email *"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Phone"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
          />
          <input
            value={form.specialization}
            onChange={(e) => setForm({ ...form, specialization: e.target.value })}
            placeholder="Specialization (e.g. India, UAE)"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30"
          />
        </div>
        <div className="mt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-base">
              {submitting ? "hourglass_empty" : "person_add"}
            </span>
            {submitting ? "Sending invite…" : "Create & send invite"}
          </button>
        </div>
      </form>

      {/* Agent list */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
            Agents ({agents.length})
          </h2>
          <button
            onClick={load}
            className="text-xs font-bold text-slate-400 hover:text-[#1152d4] flex items-center gap-1 bg-transparent border-none cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading agents…</div>
        ) : error ? (
          <div className="p-10 text-center text-red-500 text-sm">{error}</div>
        ) : agents.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No agents yet. Add your first agent above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-bold">Agent</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Specialization</th>
                  <th className="px-3 py-3 font-bold text-center">Assigned</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-800">{a.name || "—"}</div>
                      <div className="text-slate-400 text-xs">{a.email}</div>
                      {a.phone && <div className="text-slate-300 text-xs">{a.phone}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ring-1 capitalize ${
                          STATUS_BADGE[a.status] || STATUS_BADGE.disabled
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{a.specialization || "—"}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-700">{a.assignedCount}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewActivity(a)}
                          disabled={busyId === a.id}
                          title="View activity"
                          className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg ring-1 ring-indigo-200 disabled:opacity-50 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">analytics</span>
                          View
                        </button>
                        {a.status === "invited" && (
                          <button
                            onClick={() => resendInvite(a)}
                            disabled={busyId === a.id}
                            className="px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg ring-1 ring-amber-200 disabled:opacity-50 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">mail</span>
                            Resend
                          </button>
                        )}
                        {a.status === "disabled" ? (
                          <button
                            onClick={() => setStatus(a, "active")}
                            disabled={busyId === a.id}
                            className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg ring-1 ring-emerald-200 disabled:opacity-50 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Enable
                          </button>
                        ) : (
                          <button
                            onClick={() => setStatus(a, "disabled")}
                            disabled={busyId === a.id}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg ring-1 ring-slate-200 disabled:opacity-50 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">block</span>
                            Disable
                          </button>
                        )}
                        <button
                          onClick={() => removeAgent(a)}
                          disabled={busyId === a.id}
                          title="Remove agent"
                          className="px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg ring-1 ring-red-200 disabled:opacity-50 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agent activity panel */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 sm:p-10 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) { setViewing(null); setActivity(null); } }}
        >
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">{viewing.name || viewing.email}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {viewing.email}{viewing.specialization ? ` · ${viewing.specialization}` : ""} ·{" "}
                  <span className="capitalize">{viewing.status}</span>
                </div>
              </div>
              <button onClick={() => { setViewing(null); setActivity(null); }} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="p-6">
              {activityLoading ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading activity…</div>
              ) : !activity ? (
                <div className="py-12 text-center text-red-500 text-sm">Could not load this agent's activity.</div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-2xl font-black text-[#1152d4]">{activity.stats.total}</div>
                      <div className="text-[11px] font-bold uppercase text-slate-400">Assigned</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-2xl font-black text-amber-600">{activity.stats.active}</div>
                      <div className="text-[11px] font-bold uppercase text-slate-400">In progress</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-sm font-black text-slate-700 mt-1">
                        {activity.stats.lastActivity ? new Date(activity.stats.lastActivity).toLocaleDateString() : "—"}
                      </div>
                      <div className="text-[11px] font-bold uppercase text-slate-400">Last activity</div>
                    </div>
                  </div>

                  {activity.stats.byStatus && Object.keys(activity.stats.byStatus).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {Object.entries(activity.stats.byStatus).map(([st, n]) => (
                        <span key={st} className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold capitalize">
                          {st.replace(/_/g, " ")}: {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assigned applications */}
                  <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500 flex items-center justify-between">
                      <span>Assigned applications ({activity.applications.length})</span>
                      <span className="normal-case font-medium text-slate-400 tracking-normal">Click a reference to open &amp; manage →</span>
                    </div>
                    {activity.applications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">No applications assigned yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100">
                              <th className="px-4 py-2 font-bold">Reference</th>
                              <th className="px-3 py-2 font-bold">Applicant</th>
                              <th className="px-3 py-2 font-bold">Destination</th>
                              <th className="px-3 py-2 font-bold">Status</th>
                              <th className="px-4 py-2 font-bold">Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activity.applications.map((a) => (
                              <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                                <td className="px-4 py-2.5">
                                  <Link to={`/visa/admin/applications/${a.id}`} className="font-mono font-bold text-[#1152d4] text-xs hover:underline no-underline">{a.ref}</Link>
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">{a.applicant}</td>
                                <td className="px-3 py-2.5 text-slate-500 capitalize">{a.destination}</td>
                                <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold capitalize">{(a.status || "").replace(/_/g, " ")}</span></td>
                                <td className="px-4 py-2.5 text-slate-400 text-xs">{a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisaAgentsManager;
