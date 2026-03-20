import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../Navbar";
import Footer from "../Footer";
import { getApiUrl, apiPost } from "../../../utils/apiHelper";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen 23: Consultation Booking Calendar

const CONSULTANTS = [
  {
    id: 1,
    role: "Student Visa Expert",
    name: "Sarah Miller",
    img: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    bio: "10+ years experience with student visas across US, UK, Canada & Australia.",
    rating: 4.9,
    reviews: 312,
  },
  {
    id: 2,
    role: "Work Permit Pro",
    name: "David Chen",
    img: "https://api.dicebear.com/7.x/avataaars/svg?seed=David",
    bio: "Specialist in H-1B, L-1, and skilled worker visas across 30+ countries.",
    rating: 4.8,
    reviews: 274,
  },
  {
    id: 3,
    role: "Tourist Visa Lead",
    name: "Elena Rodriguez",
    img: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena",
    bio: "Expert in Schengen, B-2 tourist, and short-stay visa applications.",
    rating: 4.9,
    reviews: 408,
  },
  {
    id: 4,
    role: "Investor Specialist",
    name: "James Wilson",
    img: "https://api.dicebear.com/7.x/avataaars/svg?seed=James",
    bio: "Focused on EB-5, Golden Visa, and investor immigration pathways.",
    rating: 4.7,
    reviews: 189,
  },
];

const TIME_SLOTS = [
  { time: "09:00 AM", available: true },
  { time: "10:30 AM", available: true },
  { time: "12:00 PM", available: true },
  { time: "01:30 PM", available: true },
  { time: "03:00 PM", available: false },
  { time: "04:30 PM", available: true },
  { time: "06:00 PM", available: true },
  { time: "07:30 PM", available: true },
];

// Build a simple calendar: current month starting from today
const buildCalendar = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  return { year, month, daysInMonth, firstDay, todayDate: today.getDate() };
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ConsultationBooking = () => {
  const navigate = useNavigate();
  const cal = buildCalendar();

  const [selectedConsultant, setSelectedConsultant] = useState(1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [calMonth, setCalMonth] = useState(cal.month);
  const [calYear, setCalYear] = useState(cal.year);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [bookingSuccess, setBookingSuccess] = useState(null);

  const activeConsultant = CONSULTANTS.find((c) => c.id === selectedConsultant);

  // Calendar helpers
  const daysInCalMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfCalMonth = new Date(calYear, calMonth, 1).getDay();
  const today = new Date();

  const isDateDisabled = (day) => {
    const d = new Date(calYear, calMonth, day);
    return d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  };

  const goToPrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  const formatBookingDate = () => {
    if (!selectedDate) return null;
    const d = new Date(calYear, calMonth, selectedDate);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  };

  const validate = () => {
    const errors = {};
    if (!selectedDate) errors.date = "Please select a date.";
    if (!selectedTime) errors.time = "Please select a time slot.";
    if (!customerName.trim()) errors.customerName = "Your name is required.";
    if (!customerEmail.trim()) errors.customerEmail = "Your email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
      errors.customerEmail = "Enter a valid email address.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleBooking = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const payload = {
        consultantName: activeConsultant.name,
        consultantRole: activeConsultant.role,
        bookingDate: formatBookingDate(),
        bookingTime: selectedTime,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        amount: 49.0,
        notes: notes.trim() || null,
      };

      const response = await apiPost("visa/consultations", payload);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to book consultation. Please try again.",
        );
      }

      setBookingSuccess(data.data);
    } catch (err) {
      console.error("ConsultationBooking error:", err);
      setSubmitError(
        err.message || "An unexpected error occurred. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Success Screen ───────────────────────────────────────────────────────
  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
        <Navbar forceScrolled={true} />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <div className="flex items-center justify-center min-h-screen px-4 pt-16">
          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/40 p-10 max-w-lg w-full text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-4xl text-green-600">
                check_circle
              </span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">
              Booking Confirmed!
            </h1>
            <p className="text-slate-500 mb-8">
              Your consultation has been booked successfully. A confirmation has
              been sent to{" "}
              <span className="font-bold text-slate-700">
                {bookingSuccess.customer_email || customerEmail}
              </span>
              .
            </p>

            <div className="space-y-3 text-left mb-8">
              {[
                {
                  icon: "person",
                  label: "Consultant",
                  value:
                    bookingSuccess.consultant_name || activeConsultant.name,
                },
                {
                  icon: "calendar_today",
                  label: "Date",
                  value: bookingSuccess.booking_date || formatBookingDate(),
                },
                {
                  icon: "schedule",
                  label: "Time",
                  value: bookingSuccess.booking_time || selectedTime,
                },
                {
                  icon: "videocam",
                  label: "Platform",
                  value: "Video Consultation — Secure link via email",
                },
                {
                  icon: "payments",
                  label: "Amount",
                  value: `$${bookingSuccess.amount || "49.00"}`,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                >
                  <div className="w-9 h-9 bg-[#1152d4]/10 rounded-lg flex items-center justify-center text-[#1152d4] shrink-0">
                    <span className="material-symbols-outlined text-lg">
                      {item.icon}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {item.label}
                    </p>
                    <p className="text-sm font-bold text-slate-800">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <Link
                to="/visa/status"
                className="flex items-center justify-center gap-2 py-3 bg-[#1152d4] text-white rounded-xl font-bold text-sm hover:bg-[#0e42b0] transition-all no-underline"
              >
                <span className="material-symbols-outlined text-lg">
                  dashboard
                </span>
                View My Status Dashboard
              </Link>
              <Link
                to="/visa"
                className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors no-underline"
              >
                <span className="material-symbols-outlined text-lg">home</span>
                Back to Visa Home
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ─── Booking Form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <Navbar forceScrolled={true} />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pt-24">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 mb-6 text-sm text-slate-500">
          <Link
            to="/visa"
            className="hover:text-[#1152d4] no-underline transition-colors"
          >
            Visa &amp; Documents
          </Link>
          <span className="material-symbols-outlined text-sm">
            chevron_right
          </span>
          <span className="text-slate-900 font-bold">Book a Consultation</span>
        </nav>

        {/* Quick Nav */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { to: "/visa", icon: "home", label: "Visa Home" },
            { to: "/visa/apply", icon: "edit_document", label: "Apply" },
            { to: "/visa/track", icon: "search", label: "Track" },
            { to: "/visa/status", icon: "dashboard", label: "My Status" },
            { to: "/visa/documents", icon: "folder_open", label: "Documents" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-[#1152d4]/10 hover:text-[#1152d4] transition-all no-underline"
            >
              <span className="material-symbols-outlined text-sm">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            Schedule a Video Consultation
          </h1>
          <p className="text-slate-500 text-base sm:text-lg max-w-2xl mt-2 font-medium">
            Select your preferred consultant, date, and time to start your visa
            application process with our certified experts.
          </p>
        </div>

        {/* Consultant Selection */}
        <div className="mb-10 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto gap-2 p-1">
            {CONSULTANTS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedConsultant(c.id)}
                className={`flex flex-col items-center min-w-[180px] p-5 rounded-xl transition-all border-2 ${
                  selectedConsultant === c.id
                    ? "bg-[#1152d4]/5 border-[#1152d4] text-[#1152d4]"
                    : "border-transparent hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div
                  className={`size-16 rounded-full mb-3 border-2 overflow-hidden ${
                    selectedConsultant === c.id
                      ? "border-[#1152d4]"
                      : "border-slate-100"
                  }`}
                >
                  <img
                    src={c.img}
                    alt={c.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm font-black text-center leading-tight">
                  {c.role}
                </p>
                <p className="text-xs font-medium opacity-70 mt-1">{c.name}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="material-symbols-outlined text-amber-400 text-sm">
                    star
                  </span>
                  <span className="text-xs font-bold">{c.rating}</span>
                  <span className="text-[10px] text-slate-400">
                    ({c.reviews})
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Consultant bio */}
          {activeConsultant && (
            <div className="px-5 pb-4 pt-2 border-t border-slate-100 flex items-center gap-3 bg-[#1152d4]/[0.02]">
              <span className="material-symbols-outlined text-[#1152d4] text-sm">
                info
              </span>
              <p className="text-xs text-slate-600 font-medium">
                <span className="font-bold text-[#1152d4]">
                  {activeConsultant.name}
                </span>{" "}
                — {activeConsultant.bio}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Calendar, Time, Contact Form */}
          <div className="lg:col-span-8 space-y-8">
            {/* Calendar & Time Slots */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Calendar */}
                <div className="p-6 sm:p-8 border-b md:border-b-0 md:border-r border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-slate-900">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </h3>
                    <div className="flex gap-1">
                      <button
                        onClick={goToPrevMonth}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                      >
                        <span className="material-symbols-outlined">
                          chevron_left
                        </span>
                      </button>
                      <button
                        onClick={goToNextMonth}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                      >
                        <span className="material-symbols-outlined">
                          chevron_right
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 mb-3 uppercase tracking-[0.1em]">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {/* Leading empty cells */}
                    {Array.from({ length: firstDayOfCalMonth }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: daysInCalMonth }).map((_, i) => {
                      const day = i + 1;
                      const disabled = isDateDisabled(day);
                      return (
                        <button
                          key={day}
                          disabled={disabled}
                          onClick={() => setSelectedDate(day)}
                          className={`p-2 text-xs font-bold rounded-xl transition-all ${
                            selectedDate === day
                              ? "bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/30 scale-110"
                              : disabled
                                ? "text-slate-300 cursor-not-allowed"
                                : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  {fieldErrors.date && (
                    <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        error
                      </span>
                      {fieldErrors.date}
                    </p>
                  )}
                </div>

                {/* Time Slots */}
                <div className="p-6 sm:p-8 bg-slate-50/50">
                  <h3 className="font-black text-slate-900 mb-6">
                    Available Time Slots
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {TIME_SLOTS.map(({ time, available }) => (
                      <button
                        key={time}
                        disabled={!available}
                        onClick={() => {
                          setSelectedTime(time);
                          setFieldErrors((prev) => ({
                            ...prev,
                            time: "",
                          }));
                        }}
                        className={`py-3.5 px-4 rounded-xl text-xs font-black transition-all border-2 ${
                          !available
                            ? "bg-slate-100 text-slate-300 border-transparent line-through cursor-not-allowed"
                            : selectedTime === time
                              ? "bg-[#1152d4] text-white border-[#1152d4] shadow-lg shadow-[#1152d4]/20"
                              : "bg-white border-slate-100 text-slate-700 hover:border-[#1152d4] hover:text-[#1152d4]"
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>

                  {fieldErrors.time && (
                    <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        error
                      </span>
                      {fieldErrors.time}
                    </p>
                  )}

                  <div className="mt-8 pt-6 border-t border-slate-200">
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-2 uppercase tracking-wide">
                      <span className="material-symbols-outlined text-sm text-[#1152d4]">
                        info
                      </span>
                      Timezone: Your local time
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1152d4]">
                  person
                </span>
                Your Contact Details
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (fieldErrors.customerName)
                        setFieldErrors((p) => ({ ...p, customerName: "" }));
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.customerName
                        ? "border-red-400 bg-red-50"
                        : "border-slate-200"
                    } h-12 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30 focus:border-[#1152d4] transition-all`}
                    placeholder="As shown on passport"
                  />
                  {fieldErrors.customerName && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        error
                      </span>
                      {fieldErrors.customerName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => {
                      setCustomerEmail(e.target.value);
                      if (fieldErrors.customerEmail)
                        setFieldErrors((p) => ({ ...p, customerEmail: "" }));
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.customerEmail
                        ? "border-red-400 bg-red-50"
                        : "border-slate-200"
                    } h-12 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30 focus:border-[#1152d4] transition-all`}
                    placeholder="Confirmation will be sent here"
                  />
                  {fieldErrors.customerEmail && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        error
                      </span>
                      {fieldErrors.customerEmail}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notes / Questions{" "}
                    <span className="text-slate-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]/30 focus:border-[#1152d4] resize-none transition-all"
                    placeholder="E.g. I need help with a US B-2 tourist visa application..."
                  />
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-[#1152d4]/5 rounded-2xl p-6 sm:p-8 border border-[#1152d4]/10">
              <h3 className="text-xl font-black text-slate-900 mb-8">
                How it works
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                {[
                  {
                    step: 1,
                    title: "Pick your expert",
                    desc: "Choose a consultant based on your visa type and their specific expertise.",
                  },
                  {
                    step: 2,
                    title: "Select date & time",
                    desc: "Find a slot that fits your schedule. Our experts are available globally.",
                  },
                  {
                    step: 3,
                    title: "Get your link",
                    desc: "After booking, you'll receive a secure video link via email for your call.",
                  },
                ].map(({ step, title, desc }) => (
                  <div
                    key={step}
                    className="flex flex-col items-center md:items-start gap-4"
                  >
                    <div className="size-10 rounded-full bg-[#1152d4] text-white flex items-center justify-center font-black shadow-lg shadow-[#1152d4]/20">
                      {step}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 mb-1">
                        {title}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Booking Summary */}
          <div className="lg:col-span-4 sticky top-24">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8">
              <h3 className="text-xl font-black text-slate-900 mb-8">
                Booking Summary
              </h3>

              <div className="space-y-4 mb-8">
                {/* Consultant */}
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <img
                    src={activeConsultant?.img}
                    alt={activeConsultant?.name}
                    className="size-12 rounded-full border-2 border-white shadow-sm"
                  />
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">
                      Expert
                    </p>
                    <p className="text-slate-900 font-black leading-tight">
                      {activeConsultant?.name}
                    </p>
                    <p className="text-[10px] text-[#1152d4] font-black uppercase mt-0.5">
                      {activeConsultant?.role}
                    </p>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="size-12 rounded-2xl bg-[#1152d4]/10 flex items-center justify-center text-[#1152d4]">
                    <span className="material-symbols-outlined text-2xl">
                      calendar_today
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">
                      Schedule
                    </p>
                    {selectedDate ? (
                      <p className="text-slate-900 font-black leading-tight">
                        {MONTH_NAMES[calMonth]} {selectedDate}, {calYear}
                      </p>
                    ) : (
                      <p className="text-slate-400 font-medium text-sm italic">
                        No date selected
                      </p>
                    )}
                    {selectedTime ? (
                      <p className="text-[10px] text-slate-500 font-black uppercase mt-0.5">
                        {selectedTime} (45 min)
                      </p>
                    ) : (
                      <p className="text-slate-400 font-medium text-xs italic mt-0.5">
                        No time selected
                      </p>
                    )}
                  </div>
                </div>

                {/* Platform */}
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="size-12 rounded-2xl bg-[#1152d4]/10 flex items-center justify-center text-[#1152d4]">
                    <span className="material-symbols-outlined text-2xl">
                      videocam
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">
                      Platform
                    </p>
                    <p className="text-slate-900 font-black leading-tight">
                      Video Consultation
                    </p>
                    <p className="text-[10px] text-slate-500 font-black uppercase mt-0.5">
                      Secure Link Provided
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-5">
                <div className="flex justify-between items-center bg-[#1152d4]/5 p-4 rounded-2xl">
                  <span className="text-slate-600 font-bold uppercase text-xs tracking-widest">
                    Total Amount
                  </span>
                  <span className="text-2xl font-black text-[#1152d4]">
                    $49.00
                  </span>
                </div>

                {/* Error */}
                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-sm">
                    <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">
                      error
                    </span>
                    <p>{submitError}</p>
                  </div>
                )}

                <button
                  onClick={handleBooking}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-[#1152d4] text-white rounded-2xl font-black text-base hover:bg-[#0e42b0] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#1152d4]/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
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
                      Confirming...
                    </>
                  ) : (
                    "Confirm Booking"
                  )}
                </button>

                <p className="text-center text-[10px] text-slate-400 px-4 font-bold uppercase tracking-wide">
                  Full refund for cancellations made 24h prior to appointment.
                </p>
              </div>
            </div>

            <div className="mt-6 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-green-500 text-2xl">
                verified_user
              </span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Secure &amp; Encrypted Booking
              </span>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ConsultationBooking;
