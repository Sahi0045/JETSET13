import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { getApiUrl, apiGet, apiPost, apiPut, apiDelete } from "../../../../utils/apiHelper";
import { useVisaRealtime } from "../../../../hooks/useVisaRealtime";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Admin - Single Application Detail / Review Page — connected to live API

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "documents_pending", label: "Documents Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "additional_info_required", label: "Additional Info Required" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

const STATUS_COLORS = {
  submitted: "bg-blue-100 text-blue-800",
  documents_pending: "bg-amber-100 text-amber-800",
  under_review: "bg-purple-100 text-purple-800",
  additional_info_required: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-slate-100 text-slate-600",
  completed: "bg-emerald-100 text-emerald-800",
};

const DOC_STATUS_COLORS = {
  verified: "bg-emerald-50 text-emerald-600",
  uploaded: "bg-blue-50 text-blue-600",
  rejected: "bg-red-50 text-red-600",
  pending: "bg-amber-50 text-amber-600",
};

/** Logged-in user's role, from whichever key the login flow used. */
function currentRole() {
  try {
    const raw =
      localStorage.getItem("visaAdminUser") ||
      localStorage.getItem("adminUser") ||
      localStorage.getItem("user");
    return raw ? JSON.parse(raw)?.role || null : null;
  } catch {
    return null;
  }
}

const VisaApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  // Keep links/redirects on the current panel base (/visa/admin or /visa/agent).
  const base = useLocation().pathname.startsWith("/visa/agent") ? "/visa/agent" : "/visa/admin";

  // ── State ──────────────────────────────────────────────────────────────────
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");

  const [internalNote, setInternalNote] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const [docUpdating, setDocUpdating] = useState({});

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Agent assignment (admin/superadmin only).
  const role = currentRole();
  const canAssign = role === "admin" || role === "superadmin";
  const [assignableAgents, setAssignableAgents] = useState([]);
  const [assigning, setAssigning] = useState(false);

  // ── Fetch application ──────────────────────────────────────────────────────
  const fetchApp = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiGet(`visa/applications/${id}`);
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        if (response.status === 404) {
          setError("Application not found. It may have been deleted.");
          return;
        }
        throw new Error(data.message || "Failed to load application.");
      }
      setApp(data.data);
      setNewStatus(data.data.status);
      setInternalNote(data.data.notes || "");
    } catch (err) {
      console.error("VisaApplicationDetail fetch error:", err);
      setError(err.message || "An error occurred while loading the application.");
    } finally {
      setLoading(false);
    }
  }, [id]);

useEffect(() => {
    fetchApp();
  }, [fetchApp, id]);

  // Load the active-agent picklist for the assignment dropdown (admin/superadmin only).
  useEffect(() => {
    if (!canAssign) return;
    (async () => {
      try {
        const response = await apiGet("visa/admin/assignable-agents");
        const data = await response.json();
        if (response.ok && data.success) setAssignableAgents(data.agents || []);
      } catch (e) {
        console.warn("Could not load assignable agents:", e.message);
      }
    })();
  }, [canAssign]);

  // Assign / reassign / unassign the application's agent.
  const assignAgent = async (agentId) => {
    setAssigning(true);
    try {
      const response = await apiPut(`visa/applications/${id}`, {
        assigned_agent: agentId || null,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Failed to assign agent.");
      setApp(data.data);
    } catch (err) {
      console.error("assignAgent error:", err);
      alert(err.message || "Failed to assign agent.");
    } finally {
      setAssigning(false);
    }
  };

  // Resolve an assigned_agent id to a readable name (falls back to the raw value).
  const assignedAgentName = (() => {
    if (!app?.assigned_agent) return "Unassigned";
    const match = assignableAgents.find((a) => String(a.id) === String(app.assigned_agent));
    return match ? match.name : app.assigned_agent;
  })();

  useVisaRealtime({
    tables: ['visa_applications'],
    applicationId: id,
    onApplicationUpdate: () => {
      fetchApp();
    },
    getDataFn: fetchApp,
    fetchOnMount: false,
    fallbackPollingMs: 10000
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Status update ──────────────────────────────────────────────────────────
  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setStatusUpdating(true);
    setStatusError("");
    try {
      const response = await apiPost(`visa/applications/${id}/timeline`, {
        status: newStatus,
        note: statusNote.trim() || `Status changed to ${newStatus}.`,
        by: "Admin",
      });
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update status.");
      }
      setApp(data.data);
      setShowStatusModal(false);
      setStatusNote("");
    } catch (err) {
      console.error("Status update error:", err);
      setStatusError(err.message || "Failed to update status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Quick status shortcuts ─────────────────────────────────────────────────
  const quickStatusUpdate = async (status, note) => {
    setStatusUpdating(true);
    try {
      const response = await apiPost(`visa/applications/${id}/timeline`, {
        status, note, by: "Admin",
      });
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update.");
      }
      setApp(data.data);
      setNewStatus(status);
    } catch (err) {
      console.error("Quick status update error:", err);
      alert(err.message || "Failed to update status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Refund the service fee (reverses the ARC payment) ──────────────────────
  const handleRefund = async () => {
    if (!window.confirm("Refund the visa service fee for this application? This reverses the payment via ARC Pay.")) return;
    setStatusUpdating(true);
    try {
      const response = await apiPost(`visa/applications/${id}/refund`, {
        reason: "Refund issued from admin panel",
      });
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !(data.success || data.alreadyRefunded)) {
        throw new Error(data.message || "Refund failed.");
      }
      alert(data.alreadyRefunded ? "Already refunded." : `Refund issued (${data.action || "OK"}).`);
      fetchApp();
    } catch (err) {
      console.error("Refund error:", err);
      alert(err.message || "Refund failed.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Open a private document via a short-lived signed URL ───────────────────
  const viewDocument = async (pathOrUrl) => {
    try {
      const response = await apiGet(`visa/document-url?path=${encodeURIComponent(pathOrUrl)}`);
      const data = await response.json();
      if (data?.success && data.url) {
        window.open(data.url, "_blank", "noopener");
      } else {
        alert(data?.message || "Could not open this document.");
      }
    } catch (err) {
      console.error("viewDocument error:", err);
      alert("Could not open this document.");
    }
  };

  // ── Save internal notes ────────────────────────────────────────────────────
  const handleSaveNotes = async () => {
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      const response = await apiPut(`visa/applications/${id}`, { notes: internalNote });
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save notes.");
      }
      setApp(data.data);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (err) {
      console.error("Save notes error:", err);
      alert(err.message || "Failed to save notes.");
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Document status update ─────────────────────────────────────────────────
  const handleDocStatusUpdate = async (docName, newDocStatus) => {
    setDocUpdating((prev) => ({ ...prev, [docName]: true }));
    try {
      const response = await apiPost(`visa/applications/${id}/documents`, {
        docName, status: newDocStatus,
      });
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update document.");
      }
      setApp(data.data);
    } catch (err) {
      console.error("Doc status update error:", err);
      alert(err.message || "Failed to update document status.");
    } finally {
      setDocUpdating((prev) => ({ ...prev, [docName]: false }));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await apiDelete(`visa/applications/${id}`);
      let data;
      try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to delete application.");
      }
      navigate(`${base}/applications`);
    } catch (err) {
      console.error("Delete error:", err);
      alert(err.message || "Failed to delete application.");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f6f8] font-sans">
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-10 space-y-8">
          {/* Skeleton header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 animate-pulse">
            <div className="space-y-3">
              <div className="h-8 bg-slate-200 rounded-xl w-64" />
              <div className="h-4 bg-slate-100 rounded w-80" />
            </div>
            <div className="flex gap-3">
              <div className="h-11 bg-slate-200 rounded-xl w-36" />
              <div className="h-11 bg-slate-100 rounded-xl w-36" />
            </div>
          </div>

          {/* Skeleton cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-3xl p-8 border border-slate-100 shadow-xl shadow-slate-200/40 animate-pulse"
                >
                  <div className="h-5 bg-slate-200 rounded w-48 mb-6" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div key={j} className="space-y-2">
                        <div className="h-3 bg-slate-100 rounded w-16" />
                        <div className="h-4 bg-slate-200 rounded w-24" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm animate-pulse"
                >
                  <div className="h-4 bg-slate-200 rounded w-32 mb-4" />
                  <div className="space-y-3">
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-5/6" />
                    <div className="h-3 bg-slate-100 rounded w-4/6" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────
  if (error || !app) {
    return (
      <div className="min-h-screen bg-[#f6f6f8] font-sans flex items-center justify-center px-4">
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/40 p-10 max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl text-red-500">
              error
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-3">
            Application Not Found
          </h2>
          <p className="text-slate-500 text-sm mb-8">
            {error || "This application could not be loaded."}
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to={`${base}/applications`}
              className="flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all no-underline"
            >
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
              Back to Applications
            </Link>
            <button
              onClick={fetchApp}
              className="py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const applicant = app.personal_info || {};
  const travel = app.travel_details || {};
  const documents = Array.isArray(app.documents) ? app.documents : [];
  const timeline = Array.isArray(app.timeline) ? app.timeline : [];

  const applicantName =
    `${applicant.firstName || ""} ${applicant.lastName || ""}`.trim() || "—";
  const currentStatusLabel =
    STATUS_OPTIONS.find((s) => s.value === app.status)?.label || app.status;

  // ── Main Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      {/* Mobile back nav */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm lg:hidden">
        <Link
          to={`${base}/applications`}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#1152d4] no-underline"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to Applications
        </Link>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 lg:pt-10 pb-20">
        {/* Breadcrumbs – desktop */}
        <nav className="hidden lg:flex items-center gap-2 mb-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          <Link
            to={base}
            className="hover:text-[#1152d4] no-underline flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">dashboard</span>
            Admin
          </Link>
          <span className="text-slate-200">/</span>
          <Link
            to={`${base}/applications`}
            className="hover:text-[#1152d4] no-underline flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              assignment
            </span>
            Applications
          </Link>
          <span className="text-slate-200">/</span>
          <span className="text-slate-900 font-black">
            {app.application_ref}
          </span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8 lg:mb-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 lg:gap-3 mb-3">
              <h1 className="text-xl lg:text-3xl font-black tracking-tight">
                {app.application_ref}
              </h1>
              <span
                className={`${STATUS_COLORS[app.status] || "bg-slate-100 text-slate-600"} px-3 lg:px-4 py-1 lg:py-1.5 rounded-full text-[10px] lg:text-xs font-black uppercase tracking-wider`}
              >
                {currentStatusLabel}
              </span>
              {app.priority === "high" && (
                <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-[10px] lg:text-xs font-black uppercase tracking-wider">
                  ⚡ High
                </span>
              )}
              {app.priority === "urgent" && (
                <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded text-[10px] lg:text-xs font-black uppercase tracking-wider">
                  🔴 Urgent
                </span>
              )}
            </div>
            <p className="text-slate-400 text-[11px] lg:text-sm font-medium">
              Submitted{" "}
              <span className="text-slate-600 font-bold">
                {formatDate(app.created_at)}
              </span>{" "}
              · Last updated{" "}
              <span className="text-slate-600 font-bold">
                {formatDate(app.updated_at)}
              </span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto">
            <button
              onClick={() => {
                setNewStatus(app.status);
                setStatusNote("");
                setStatusError("");
                setShowStatusModal(true);
              }}
              disabled={statusUpdating}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-[0.15em] hover:bg-[#0e42b0] transition-all shadow-xl shadow-[#1152d4]/20 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">edit</span>
              Update Status
            </button>
            <button
              onClick={fetchApp}
              disabled={loading}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-[0.15em] hover:bg-slate-50 transition-all shadow-sm"
            >
              <span
                className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}
              >
                refresh
              </span>
              Refresh
            </button>
            {canAssign && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-red-200 text-red-500 rounded-xl font-black text-[11px] lg:text-xs uppercase tracking-[0.15em] hover:bg-red-50 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* ── Left Column ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* Applicant Profile */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
              <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                  <span className="material-symbols-outlined text-xl">
                    person
                  </span>
                </span>
                Applicant Profile
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                {[
                  {
                    label: "Full Name",
                    value: applicantName,
                  },
                  {
                    label: "Email",
                    value: applicant.email || "—",
                  },
                  {
                    label: "Phone",
                    value: applicant.phone || "—",
                  },
                  {
                    label: "Date of Birth",
                    value: applicant.dateOfBirth || "—",
                  },
                  {
                    label: "Nationality",
                    value: applicant.nationality || "—",
                  },
                  {
                    label: "Passport No.",
                    value: applicant.passportNumber || "—",
                  },
                  {
                    label: "Passport Expiry",
                    value: applicant.passportExpiry || "—",
                  },
                  {
                    label: "User ID",
                    value: app.user_id
                      ? app.user_id.slice(0, 12) + "…"
                      : "Guest",
                  },
                ].map((field, i) => (
                  <div key={i} className="min-w-0">
                    <p className="text-[9px] lg:text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mb-1.5">
                      {field.label}
                    </p>
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Journey Overview */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
              <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                  <span className="material-symbols-outlined text-xl">
                    flight_takeoff
                  </span>
                </span>
                Journey Overview
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {[
                  {
                    label: "Destination",
                    value: travel.destination || "—",
                  },
                  {
                    label: "Visa Category",
                    value: travel.visaType
                      ? travel.visaType.charAt(0).toUpperCase() +
                        travel.visaType.slice(1)
                      : "—",
                  },
                  {
                    label: "Arrival",
                    value: travel.arrivalDate || "—",
                  },
                  {
                    label: "Departure",
                    value: travel.departureDate || "—",
                  },
                  {
                    label: "Accommodation",
                    value: travel.accommodation || "—",
                  },
                  {
                    label: "Purpose",
                    value: travel.purposeOfVisit || "—",
                  },
                ].map((field, i) => (
                  <div key={i} className="min-w-0">
                    <p className="text-[9px] lg:text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mb-1.5">
                      {field.label}
                    </p>
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {field.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-8">
              <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-2.5">
                <span className="p-2 bg-[#1152d4]/5 text-[#1152d4] rounded-lg">
                  <span className="material-symbols-outlined text-xl">
                    folder_managed
                  </span>
                </span>
                Documentation ({documents.length})
              </h2>

              {documents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <span className="material-symbols-outlined text-4xl block mb-2">
                    folder_open
                  </span>
                  <p className="text-sm font-medium">
                    No documents uploaded yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {documents.map((doc, i) => {
                    const docName =
                      doc.name || doc.docName || `Document ${i + 1}`;
                    const statusKey = doc.status || "pending";
                    const isUpdating = docUpdating[docName];

                    return (
                      <div
                        key={i}
                        className="flex flex-col gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-slate-50 text-slate-400 group-hover:bg-[#1152d4]/10 group-hover:text-[#1152d4] rounded-lg transition-colors shrink-0">
                              <span className="material-symbols-outlined text-xl">
                                description
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-black text-slate-900 truncate">
                                {docName}
                              </p>
                              {doc.file_url ? (
                                <button
                                  type="button"
                                  onClick={() => viewDocument(doc.file_url)}
                                  className="text-[10px] font-bold text-[#1152d4] hover:underline truncate block bg-transparent border-none p-0 cursor-pointer text-left"
                                >
                                  View File ↗
                                </button>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 truncate block">
                                  No file uploaded
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0 ${DOC_STATUS_COLORS[statusKey] || DOC_STATUS_COLORS.pending}`}
                          >
                            {statusKey}
                          </span>
                        </div>

                        {/* Document action buttons */}
                        <div className="flex items-center gap-2 mt-auto flex-wrap">
                          {statusKey !== "verified" && (
                            <button
                              onClick={() =>
                                handleDocStatusUpdate(docName, "verified")
                              }
                              disabled={isUpdating}
                              className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              {isUpdating ? "…" : "Verify"}
                            </button>
                          )}
                          {statusKey !== "rejected" && (
                            <button
                              onClick={() =>
                                handleDocStatusUpdate(docName, "rejected")
                              }
                              disabled={isUpdating}
                              className="flex-1 py-2 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              {isUpdating ? "…" : "Reject"}
                            </button>
                          )}
                          {(statusKey === "verified" ||
                            statusKey === "rejected") && (
                            <button
                              onClick={() =>
                                handleDocStatusUpdate(docName, "pending")
                              }
                              disabled={isUpdating}
                              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                              {isUpdating ? "…" : "Reset"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4]">
                  timeline
                </span>
                Status History
              </h2>

              {timeline.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <p className="text-sm font-medium">No timeline events yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {[...timeline].reverse().map((event, i) => (
                    <div
                      key={i}
                      className="flex gap-4 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#1152d4] mt-2.5 shrink-0 ring-4 ring-[#1152d4]/10" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className={`${STATUS_COLORS[event.status] || "bg-slate-100 text-slate-600"} text-[10px] px-2 py-0.5 rounded-full font-bold`}
                          >
                            {STATUS_OPTIONS.find(
                              (s) => s.value === event.status,
                            )?.label || event.status}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDate(event.date)}
                          </span>
                          {event.by && (
                            <span className="text-xs text-slate-400">
                              by {event.by}
                            </span>
                          )}
                        </div>
                        {event.note && (
                          <p className="text-sm text-slate-700">{event.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column ─────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Service & Payment */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4] text-sm">
                  payments
                </span>
                Service &amp; Payment
              </h3>
              <div className="space-y-3">
                {[
                  {
                    label: "Service Tier",
                    value: app.service_tier
                      ? app.service_tier.charAt(0).toUpperCase() +
                        app.service_tier.slice(1)
                      : "—",
                  },
                  {
                    label: "Service Fee",
                    value: app.amount ? `$${app.amount}` : "—",
                  },
                  {
                    label: "Payment Status",
                    value: app.payment_status || "—",
                    badge: true,
                  },
                  {
                    label: "Priority",
                    value: app.priority
                      ? app.priority.charAt(0).toUpperCase() +
                        app.priority.slice(1)
                      : "—",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm py-1.5 border-b border-slate-50 last:border-b-0"
                  >
                    <span className="text-slate-500">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${
                          app.payment_status === "paid"
                            ? "bg-green-100 text-green-700"
                            : app.payment_status === "refunded"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.value}
                      </span>
                    ) : (
                      <span className="font-bold capitalize">{item.value}</span>
                    )}
                  </div>
                ))}

                {/* Assigned agent — dropdown for admin/superadmin, read-only otherwise. */}
                <div className="flex justify-between items-center text-sm py-1.5">
                  <span className="text-slate-500">Assigned Agent</span>
                  {canAssign ? (
                    <select
                      value={app.assigned_agent || ""}
                      disabled={assigning}
                      onChange={(e) => assignAgent(e.target.value)}
                      className="text-xs font-bold rounded-lg border border-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30 disabled:opacity-50 max-w-[160px]"
                    >
                      <option value="">Unassigned</option>
                      {assignableAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.specialization ? ` · ${a.specialization}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold">{assignedAgentName}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Internal Notes */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4] text-sm">
                  sticky_note_2
                </span>
                Internal Notes
              </h3>
              <textarea
                value={internalNote}
                onChange={(e) => {
                  setInternalNote(e.target.value);
                  setNotesSaved(false);
                }}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                placeholder="Add internal notes visible only to admin team..."
              />
              <button
                onClick={handleSaveNotes}
                disabled={notesSaving}
                className={`mt-3 w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  notesSaved
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                } disabled:opacity-60`}
              >
                {notesSaving ? (
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
                    Saving…
                  </>
                ) : notesSaved ? (
                  <>
                    <span className="material-symbols-outlined text-sm">
                      check
                    </span>
                    Notes Saved
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">
                      save
                    </span>
                    Save Notes
                  </>
                )}
              </button>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4] text-sm">
                  bolt
                </span>
                Quick Actions
              </h3>
              <div className="space-y-2">
                {app.status !== "approved" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "approved",
                        "Application approved by admin.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-lg font-bold text-sm hover:bg-green-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      check_circle
                    </span>
                    Approve Application
                  </button>
                )}
                {app.status !== "under_review" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "under_review",
                        "Application is now under detailed review.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-purple-50 text-purple-700 rounded-lg font-bold text-sm hover:bg-purple-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      rate_review
                    </span>
                    Mark Under Review
                  </button>
                )}
                {app.status !== "additional_info_required" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "additional_info_required",
                        "Additional information has been requested from the applicant.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-orange-50 text-orange-700 rounded-lg font-bold text-sm hover:bg-orange-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      help
                    </span>
                    Request More Info
                  </button>
                )}
                {app.status !== "rejected" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "rejected",
                        "Application has been rejected.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 rounded-lg font-bold text-sm hover:bg-red-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      cancel
                    </span>
                    Reject Application
                  </button>
                )}
                {app.status !== "documents_pending" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "documents_pending",
                        "Awaiting document submission from applicant.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-amber-50 text-amber-700 rounded-lg font-bold text-sm hover:bg-amber-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      description
                    </span>
                    Request Documents
                  </button>
                )}
                {app.status !== "completed" && (
                  <button
                    onClick={() =>
                      quickStatusUpdate(
                        "completed",
                        "Application process fully completed.",
                      )
                    }
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-sm hover:bg-emerald-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      verified
                    </span>
                    Mark Completed
                  </button>
                )}
                {canAssign && app.payment_status === "paid" && (
                  <button
                    onClick={handleRefund}
                    disabled={statusUpdating}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-rose-50 text-rose-700 rounded-lg font-bold text-sm hover:bg-rose-100 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      currency_exchange
                    </span>
                    Refund Service Fee
                  </button>
                )}
                {app.payment_status === "refunded" && (
                  <div className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-slate-500 rounded-lg font-bold text-sm">
                    <span className="material-symbols-outlined text-lg">task_alt</span>
                    Service fee refunded
                  </div>
                )}
              </div>

              {statusUpdating && (
                <div className="mt-3 flex items-center gap-2 text-[#1152d4] text-xs font-bold">
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
                  Updating status…
                </div>
              )}
            </div>

            {/* Linked Navigation */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4] text-sm">
                  link
                </span>
                Navigation
              </h3>
              <div className="space-y-2">
                <Link
                  to={`${base}/applications`}
                  className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-100 transition-colors no-underline"
                >
                  <span className="material-symbols-outlined text-lg">
                    list
                  </span>
                  All Applications
                </Link>
                <Link
                  to={`${base}/messages`}
                  state={{ applicationId: app.id }}
                  className="flex items-center gap-2 px-3 py-2.5 bg-[#1152d4]/5 text-[#1152d4] rounded-lg font-bold text-sm hover:bg-[#1152d4]/10 transition-colors no-underline"
                >
                  <span className="material-symbols-outlined text-lg">
                    chat
                  </span>
                  Quick Chat with Applicant
                </Link>
                <Link
                  to={base}
                  className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-100 transition-colors no-underline"
                >
                  <span className="material-symbols-outlined text-lg">
                    dashboard
                  </span>
                  Admin Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Update Modal ───────────────────────────────────────────── */}
      {showStatusModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1152d4]">
                edit
              </span>
              Update Application Status
            </h3>

            {statusError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <span className="material-symbols-outlined text-sm">error</span>
                {statusError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Note{" "}
                  <span className="text-slate-400 font-normal">
                    (visible to applicant)
                  </span>
                </label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                  placeholder="Add note about this status change..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowStatusModal(false)}
                  disabled={statusUpdating}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={statusUpdating || !newStatus}
                  className="flex-1 py-2.5 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {statusUpdating ? (
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
                    "Update & Notify"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl text-red-500">
                delete_forever
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">
              Delete Application?
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              This will permanently delete{" "}
              <span className="font-bold text-slate-700">
                {app.application_ref}
              </span>{" "}
              and all its data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? (
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
                    Deleting…
                  </>
                ) : (
                  "Yes, Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisaApplicationDetail;
