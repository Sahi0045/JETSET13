import React, { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../Navbar";
import Footer from "../Footer";
import { getApiUrl } from "../../../utils/apiHelper";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)

const STATUS_CONFIG = {
  submitted: {
    label: "Submitted",
    color: "bg-blue-100 text-blue-800",
    icon: "send",
    dotColor: "bg-blue-500",
  },
  documents_pending: {
    label: "Documents Pending",
    color: "bg-amber-100 text-amber-800",
    icon: "description",
    dotColor: "bg-amber-500",
  },
  under_review: {
    label: "Under Review",
    color: "bg-purple-100 text-purple-800",
    icon: "rate_review",
    dotColor: "bg-purple-500",
  },
  additional_info_required: {
    label: "Info Required",
    color: "bg-orange-100 text-orange-800",
    icon: "help",
    dotColor: "bg-orange-500",
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 text-green-800",
    icon: "check_circle",
    dotColor: "bg-green-500",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-800",
    icon: "cancel",
    dotColor: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-slate-100 text-slate-600",
    icon: "block",
    dotColor: "bg-slate-400",
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800",
    icon: "verified",
    dotColor: "bg-green-600",
  },
};

const VisaApplicationTracker = () => {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("ref") || "");
  const [emailQuery, setEmailQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState(null);
  const [applications, setApplications] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const handleSearch = useCallback(async () => {
    const ref = searchQuery.trim();
    const email = emailQuery.trim();

    if (!ref && !email) {
      setError("Please enter a reference number or email address.");
      return;
    }

    setLoading(true);
    setError("");
    setHasSearched(true);
    setSelectedApp(null);
    setApplications([]);

    try {
      const params = new URLSearchParams();
      if (ref) params.set("ref", ref);
      if (email) params.set("email", email);

      const response = await fetch(
        `${getApiUrl("visa/applications/track")}?${params.toString()}`,
        {
          headers: { Accept: "application/json" },
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 404) {
          setApplications([]);
          return;
        }
        throw new Error(data.message || "Failed to fetch application status.");
      }

      if (data.multiple && Array.isArray(data.data)) {
        setApplications(data.data);
        if (data.data.length === 1) setSelectedApp(data.data[0]);
      } else if (data.data) {
        const app = data.data;
        setApplications([app]);
        setSelectedApp(app);
      } else {
        setApplications([]);
      }
    } catch (err) {
      console.error("Track application error:", err);
      setError(
        err.message || "An error occurred while searching. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [searchQuery, emailQuery]);

  // Auto-search if ref is present in URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <Navbar forceScrolled={true} />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8 pt-24">
        <div className="flex flex-col w-full max-w-[1200px] flex-1">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
              <Link
                to="/visa"
                className="hover:text-[#1152d4] transition-colors"
              >
                Visa &amp; Documents
              </Link>
              <span className="material-symbols-outlined text-xs">
                chevron_right
              </span>
              <span className="text-slate-900 font-medium">
                Track Application
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">
              Track Your Application
            </h1>
            <p className="text-slate-600 text-lg">
              Enter your application reference number or email to check
              real-time status.
            </p>
          </div>

          {/* Quick Nav Links */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Link
              to="/visa"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline"
            >
              <span className="material-symbols-outlined text-sm">home</span>
              Visa Home
            </Link>
            <Link
              to="/visa/status"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline"
            >
              <span className="material-symbols-outlined text-sm">
                dashboard
              </span>
              My Status Dashboard
            </Link>
            <Link
              to="/visa/booking"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline"
            >
              <span className="material-symbols-outlined text-sm">
                calendar_month
              </span>
              Book Consultation
            </Link>
            <Link
              to="/visa/apply"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1152d4] text-white text-xs font-bold hover:bg-[#0e42b0] transition-all no-underline shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">add</span>New
              Application
            </Link>
          </div>

          {/* Search Bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full rounded-lg border border-slate-300 h-12 pl-12 pr-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1152d4] placeholder:font-sans"
                  placeholder="Reference number (e.g. VISA-2026-00001)"
                />
              </div>
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  mail
                </span>
                <input
                  type="email"
                  value={emailQuery}
                  onChange={(e) => {
                    setEmailQuery(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full rounded-lg border border-slate-300 h-12 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                  placeholder="Or search by email address"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-8 h-12 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px]"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5"
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
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">
                      search
                    </span>
                    Track
                  </>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">info</span>
              Enter your reference number (e.g. VISA-2026-00001) or the email
              used during application.
            </p>
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse"
                >
                  <div className="h-4 bg-slate-200 rounded w-1/4 mb-3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && hasSearched && applications.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center mb-8">
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">
                search_off
              </span>
              <h3 className="text-lg font-bold text-slate-700 mb-2">
                No Applications Found
              </h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
                We couldn't find any applications matching your reference number
                or email. Please double-check and try again.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/visa/apply"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-all no-underline"
                >
                  <span className="material-symbols-outlined">add</span>
                  Start New Application
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-all no-underline"
                >
                  <span className="material-symbols-outlined">
                    support_agent
                  </span>
                  Contact Support
                </Link>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && applications.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Applications List */}
              <div
                className={`space-y-4 ${selectedApp ? "lg:col-span-1" : "lg:col-span-3"}`}
              >
                {applications.map((app) => {
                  const statusCfg =
                    STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
                  const appRef =
                    app.applicationRef || app.application_ref || app.id;
                  return (
                    <button
                      key={appRef}
                      onClick={() => setSelectedApp(app)}
                      className={`w-full text-left bg-white rounded-xl border-2 p-5 transition-all hover:shadow-md ${
                        selectedApp?.applicationRef === app.applicationRef ||
                        selectedApp?.id === app.id
                          ? "border-[#1152d4] shadow-md"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-mono font-bold text-sm text-[#1152d4]">
                            {appRef}
                          </p>
                          <p className="text-slate-700 font-bold mt-1">
                            {app.destination || "—"}
                          </p>
                        </div>
                        <span
                          className={`${statusCfg.color} text-xs px-2.5 py-1 rounded-full font-bold`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">
                            flight_takeoff
                          </span>
                          {app.visaType || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">
                            schedule
                          </span>
                          {formatDate(app.submittedAt || app.created_at)}
                        </span>
                        {app.serviceTier && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">
                              workspace_premium
                            </span>
                            {app.serviceTier.charAt(0).toUpperCase() +
                              app.serviceTier.slice(1)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Application Detail Panel */}
              {selectedApp && (
                <div className="lg:col-span-2 space-y-6">
                  {/* Status Header */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <p className="font-mono font-bold text-lg text-[#1152d4]">
                          {selectedApp.applicationRef ||
                            selectedApp.application_ref ||
                            selectedApp.id}
                        </p>
                        <p className="text-slate-500 text-sm mt-1">
                          Submitted{" "}
                          {formatDate(
                            selectedApp.submittedAt || selectedApp.created_at,
                          )}
                        </p>
                        {selectedApp.applicantName && (
                          <p className="text-slate-600 text-sm font-medium">
                            Applicant: {selectedApp.applicantName}
                          </p>
                        )}
                      </div>
                      <div
                        className={`${STATUS_CONFIG[selectedApp.status]?.color} px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {STATUS_CONFIG[selectedApp.status]?.icon}
                        </span>
                        {STATUS_CONFIG[selectedApp.status]?.label}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                      {[
                        {
                          label: "Destination",
                          value: selectedApp.destination || "—",
                          icon: "pin_drop",
                        },
                        {
                          label: "Visa Type",
                          value: selectedApp.visaType || "—",
                          icon: "description",
                        },
                        {
                          label: "Service",
                          value: selectedApp.serviceTier
                            ? selectedApp.serviceTier.charAt(0).toUpperCase() +
                              selectedApp.serviceTier.slice(1)
                            : "—",
                          icon: "workspace_premium",
                        },
                        {
                          label: "Last Update",
                          value: formatDate(
                            selectedApp.lastUpdate || selectedApp.updated_at,
                          ),
                          icon: "update",
                        },
                      ].map((item, i) => (
                        <div key={i}>
                          <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                            <span className="material-symbols-outlined text-xs">
                              {item.icon}
                            </span>
                            {item.label}
                          </div>
                          <p className="text-sm font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Payment Status */}
                    {selectedApp.paymentStatus && (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-medium">
                          Payment:
                        </span>
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${
                            selectedApp.paymentStatus === "paid"
                              ? "bg-green-100 text-green-700"
                              : selectedApp.paymentStatus === "refunded"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {selectedApp.paymentStatus}
                        </span>
                        {selectedApp.amount > 0 && (
                          <span className="text-xs text-slate-500 font-medium">
                            ${selectedApp.amount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  {Array.isArray(selectedApp.timeline) &&
                    selectedApp.timeline.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#1152d4]">
                            timeline
                          </span>
                          Application Timeline
                        </h3>
                        <div className="space-y-1">
                          {[...selectedApp.timeline]
                            .reverse()
                            .map((event, i) => {
                              const sc =
                                STATUS_CONFIG[event.status] ||
                                STATUS_CONFIG.submitted;
                              return (
                                <div
                                  key={i}
                                  className="flex gap-4 pb-6 last:pb-0"
                                >
                                  <div className="flex flex-col items-center">
                                    <div
                                      className={`w-3 h-3 rounded-full shrink-0 ${sc.dotColor} ring-4 ring-white`}
                                    />
                                    {i < selectedApp.timeline.length - 1 && (
                                      <div className="w-0.5 h-full bg-slate-200 mt-1" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2 -mt-1">
                                      <span
                                        className={`${sc.color} text-[10px] px-2 py-0.5 rounded-full font-bold`}
                                      >
                                        {sc.label}
                                      </span>
                                      <span className="text-xs text-slate-400">
                                        {formatDate(event.date)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-slate-700 mt-1">
                                      {event.note}
                                    </p>
                                    {event.by && event.by !== "System" && (
                                      <p className="text-xs text-slate-400 mt-0.5">
                                        By {event.by}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                  {/* Documents Status */}
                  {Array.isArray(selectedApp.documents) &&
                    selectedApp.documents.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#1152d4]">
                            folder_open
                          </span>
                          Document Status
                        </h3>
                        <div className="space-y-3">
                          {selectedApp.documents.map((doc, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[#1152d4]">
                                  description
                                </span>
                                <span className="text-sm font-medium">
                                  {doc.name ||
                                    doc.docName ||
                                    `Document ${i + 1}`}
                                </span>
                              </div>
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                  doc.status === "verified"
                                    ? "bg-green-100 text-green-700"
                                    : doc.status === "uploaded"
                                      ? "bg-blue-100 text-blue-700"
                                      : doc.status === "rejected"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {doc.status === "verified"
                                  ? "✓ Verified"
                                  : doc.status === "uploaded"
                                    ? "↑ Uploaded"
                                    : doc.status === "rejected"
                                      ? "✗ Rejected"
                                      : "⏳ Pending"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/contact"
                      className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
                    >
                      <span className="material-symbols-outlined text-lg">
                        support_agent
                      </span>
                      Contact Support
                    </Link>
                    <Link
                      to="/visa/booking"
                      className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
                    >
                      <span className="material-symbols-outlined text-lg">
                        calendar_month
                      </span>
                      Book Consultation
                    </Link>
                    {(selectedApp.status === "submitted" ||
                      selectedApp.status === "documents_pending" ||
                      selectedApp.status === "under_review") && (
                      <Link
                        to="/visa/apply"
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#1152d4] text-white rounded-lg font-bold text-sm hover:bg-[#0e42b0] transition-colors no-underline"
                      >
                        <span className="material-symbols-outlined text-lg">
                          add
                        </span>
                        New Application
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Initial help state (before any search) */}
          {!hasSearched && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: "search",
                  title: "Track by Reference",
                  desc: "Enter your application reference number (e.g. VISA-2026-00001) received in your confirmation email.",
                },
                {
                  icon: "mail",
                  title: "Track by Email",
                  desc: "Use the email address you provided during application to find all your active applications.",
                },
                {
                  icon: "support_agent",
                  title: "Need Help?",
                  desc: "Can't find your application? Contact our support team and we'll look it up for you.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#1152d4]/10 text-[#1152d4] flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">
                      {item.icon}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {item.desc}
                  </p>
                  {item.icon === "support_agent" && (
                    <Link
                      to="/contact"
                      className="mt-auto text-[#1152d4] text-sm font-bold hover:underline no-underline flex items-center gap-1"
                    >
                      Get help{" "}
                      <span className="material-symbols-outlined text-sm">
                        arrow_forward
                      </span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default VisaApplicationTracker;
