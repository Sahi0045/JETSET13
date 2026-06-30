import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../Navbar";
import Footer from "../Footer";
import { getApiUrl, apiPost } from "../../../utils/apiHelper";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";

// Stitch MCP Project: Customer Visa Application Portal (ID: 14307733649035881866)
// Screen: Customer Visa Application Portal - Document Upload Step

const STEPS = [
  { id: 1, label: "Personal Information", icon: "person" },
  { id: 2, label: "Travel Details", icon: "flight_takeoff" },
  { id: 3, label: "Document Upload", icon: "description" },
  { id: 4, label: "Review & Pay", icon: "payments" },
];

const VisaApplication = () => {
  const navigate = useNavigate();
  const { user } = useSupabaseAuth();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const destination = searchParams.get("destination") || "";
  const nationality = searchParams.get("nationality") || "";

  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationality: nationality,
    passportNumber: "",
    passportExpiry: "",
    email: "",
    phone: "",
  });

  const [travelDetails, setTravelDetails] = useState({
    destination: destination,
    visaType: "tourist",
    arrivalDate: "",
    departureDate: "",
    accommodation: "",
    purposeOfVisit: "",
  });

  const [selectedTier, setSelectedTier] = useState("standard");

  const tiers = [
    {
      id: "standard",
      name: "Standard",
      price: "$49",
      features: [
        "Processing in 5-7 days",
        "Email updates",
        "Document checklist",
        "Basic support",
      ],
    },
    {
      id: "express",
      name: "Express",
      price: "$89",
      features: [
        "Processing in 2-3 days",
        "SMS & email updates",
        "Priority review",
        "Phone support",
        "Document pre-check",
      ],
      recommended: true,
    },
    {
      id: "premium",
      name: "Premium Concierge",
      price: "$149",
      features: [
        "Processing in 24 hours",
        "Dedicated agent",
        "Video consultation",
        "24/7 support",
        "Embassy liaison",
        "Guaranteed review",
      ],
    },
  ];

  const documents = [
    {
      id: "passport",
      icon: "menu_book",
      title: "Passport Bio Page",
      description:
        "Submit a clear color copy of the main page of your passport containing your photo and personal details.",
      formats: ["PDF, JPG, PNG"],
      maxSize: "Max 10MB",
      uploadIcon: "upload",
      uploadLabel: "Upload File",
      required: true,
    },
    {
      id: "photos",
      icon: "account_box",
      title: "Passport Size Photographs",
      description:
        "Two recent color photographs (taken within the last 6 months) with a white background.",
      formats: ["35mm x 45mm"],
      maxSize: "Digital Copy",
      uploadIcon: "add_a_photo",
      uploadLabel: "Add Photo",
      required: true,
    },
    {
      id: "bank_statements",
      icon: "account_balance_wallet",
      title: "Financial Proof (Bank Statements)",
      description:
        "Last 6 months of bank statements showing sufficient funds for the duration of stay.",
      formats: ["PDF Format Only"],
      maxSize: "E-Statements Preferred",
      uploadIcon: "account_balance",
      uploadLabel: "Import PDF",
      required: true,
      crucial: true,
    },
  ];

  const handleFileUpload = (docId, file) => {
    if (!file) return;
    // Validate before accepting: allowed types + max 5 MB (embassies reject oversized/odd files).
    const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    const MAX_BYTES = 5 * 1024 * 1024;
    const extOk = /\.(pdf|jpe?g|png)$/i.test(file.name || "");
    if (!(ALLOWED.includes(file.type) || extOk)) {
      setUploadErrors((prev) => ({ ...prev, [docId]: "Only PDF, JPG or PNG files are allowed." }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadErrors((prev) => ({ ...prev, [docId]: `File is too large (${(file.size / 1048576).toFixed(1)} MB). Max 5 MB.` }));
      return;
    }
    setUploadErrors((prev) => { const n = { ...prev }; delete n[docId]; return n; });
    setUploadedFiles((prev) => ({
      ...prev,
      [docId]: { name: file.name, file },
    }));
  };

  const validateStep = (step) => {
    const errors = {};
    if (step === 1) {
      if (!personalInfo.firstName.trim())
        errors.firstName = "First name is required";
      if (!personalInfo.lastName.trim())
        errors.lastName = "Last name is required";
      if (!personalInfo.email.trim()) errors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalInfo.email))
        errors.email = "Enter a valid email";
      if (!personalInfo.nationality.trim())
        errors.nationality = "Nationality is required";
      if (!personalInfo.passportNumber.trim())
        errors.passportNumber = "Passport number is required";
      if (!personalInfo.dateOfBirth)
        errors.dateOfBirth = "Date of birth is required";
      if (!personalInfo.passportExpiry)
        errors.passportExpiry = "Passport expiry is required";
    }
    if (step === 2) {
      if (!travelDetails.destination.trim())
        errors.destination = "Destination is required";
      if (!travelDetails.arrivalDate)
        errors.arrivalDate = "Arrival date is required";
      if (!travelDetails.departureDate)
        errors.departureDate = "Departure date is required";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handlePrev = () => {
    setFieldErrors({});
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setIsSubmitting(true);

    try {
      // Build documents payload
      // ─── Document Upload Stage ─────────────────────────────────────────────
      setSubmitError("");
      const uploadedUrls = {};
      const uploadEntries = Object.entries(uploadedFiles);

      if (uploadEntries.length > 0) {
        // We could use Promise.all, but sequential is safer for rate limits/debugging
        for (const [docId, { file }] of uploadEntries) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            // Optionally add metadata/path if needed by your backend
            
            const uploadRes = await apiPost("visa/upload", formData);
            const uploadData = await uploadRes.json();
            
            if (uploadRes.ok && uploadData.success) {
              uploadedUrls[docId] = uploadData.data.url;
            } else {
              console.warn(`Failed to upload ${docId}:`, uploadData.message);
            }
          } catch (uploadErr) {
            console.error(`Upload error for ${docId}:`, uploadErr);
          }
        }
      }

      const docsPayload = documents.map((doc) => ({
        name: doc.title,
        status: uploadedFiles[doc.id] ? "uploaded" : "pending",
        file_url: uploadedUrls[doc.id] || null,
      }));

      const payload = {
        personalInfo: {
          firstName: personalInfo.firstName.trim(),
          lastName: personalInfo.lastName.trim(),
          dateOfBirth: personalInfo.dateOfBirth,
          nationality: personalInfo.nationality.trim(),
          passportNumber: personalInfo.passportNumber.trim(),
          passportExpiry: personalInfo.passportExpiry,
          email: personalInfo.email.trim(),
          phone: personalInfo.phone.trim(),
        },
        travelDetails: {
          destination: travelDetails.destination.trim(),
          visaType: travelDetails.visaType,
          arrivalDate: travelDetails.arrivalDate,
          departureDate: travelDetails.departureDate,
          accommodation: travelDetails.accommodation.trim(),
          purposeOfVisit: travelDetails.purposeOfVisit.trim(),
        },
        serviceTier: selectedTier,
        documents: docsPayload,
        paymentStatus: "pending",
        userId: user?.id || null,
      };

      const response = await apiPost("visa/applications", payload);

      // Safely parse JSON — server may return HTML on crash/proxy error
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Server error (${response.status}). Please try again or contact support.`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to submit application. Please try again."
        );
      }

      const appRef = data.data?.applicationRef || "";
      const appId = data.data?.id || "";
      const dest = travelDetails.destination || destination;
      const successUrl = `/visa/success?id=${encodeURIComponent(appId)}&ref=${encodeURIComponent(appRef)}&destination=${encodeURIComponent(dest)}&tier=${selectedTier}`;

      // Collect the service fee via ARC Pay before finishing — redirect to hosted checkout.
      try {
        const checkoutRes = await apiPost(`visa/applications/${appId}/checkout`, {
          returnOrigin: window.location.origin,
        });
        const checkoutData = await checkoutRes.json();
        if (checkoutData?.success && checkoutData.checkoutUrl) {
          window.location.href = checkoutData.checkoutUrl; // → ARC Pay, returns to /visa/success?payment=success
          return;
        }
        if (checkoutData?.alreadyPaid) {
          navigate(`${successUrl}&payment=success`);
          return;
        }
        throw new Error(checkoutData?.message || "Could not start payment.");
      } catch (payErr) {
        // Application is saved but payment didn't start — send them to success where they
        // can retry payment with the "Pay now" button.
        console.error("visa checkout error:", payErr);
        navigate(successUrl);
        return;
      }
    } catch (err) {
      console.error("submitApplication error:", err);
      setSubmitError(
        err.message || "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const completionPercent = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  const inputClass = (field) =>
    `w-full rounded-lg border ${fieldErrors[field] ? "border-red-400 bg-red-50" : "border-slate-300"} h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]`;

  return (
    <div className="min-h-screen bg-[#f6f6f8] font-sans text-slate-900">
      <Navbar forceScrolled={true} />

      {/* Google Material Symbols */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        rel="stylesheet"
      />

      <div className="pt-16 flex flex-1 overflow-hidden min-h-screen">
        {/* Sidebar Stepper */}
        <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col justify-between fixed top-16 bottom-0 overflow-y-auto hidden lg:flex">
          <div className="flex flex-col gap-8">
            <div>
              <h1 className="text-slate-900 text-lg font-bold">
                {travelDetails.visaType === "tourist"
                  ? "Tourist Visa (B-2)"
                  : "Visa Application"}
              </h1>
              <p className="text-slate-500 text-sm">
                Application ID:{" "}
                <span className="font-mono text-[#1152d4]">#VD-PENDING</span>
              </p>
              {(travelDetails.destination || destination) && (
                <p className="text-slate-500 text-sm mt-1">
                  Destination:{" "}
                  <span className="font-medium text-slate-700">
                    {travelDetails.destination || destination}
                  </span>
                </p>
              )}
            </div>

            <nav className="flex flex-col gap-2">
              {STEPS.map((step) => {
                const isCompleted = step.id < currentStep;
                const isActive = step.id === currentStep;
                const isPending = step.id > currentStep;

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all border ${
                      isActive
                        ? "bg-[#1152d4]/5 border-[#1152d4]/20"
                        : "border-transparent"
                    } ${isPending ? "opacity-60" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isCompleted
                          ? "bg-green-100 text-green-600"
                          : isActive
                            ? "bg-[#1152d4] text-white shadow-lg shadow-[#1152d4]/30"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {isCompleted ? (
                        <span className="material-symbols-outlined text-lg">
                          check
                        </span>
                      ) : (
                        <span className="material-symbols-outlined text-lg">
                          {step.icon}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <p
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          isActive ? "text-[#1152d4]" : "text-slate-500"
                        }`}
                      >
                        Step {step.id}
                      </p>
                      <p
                        className={`text-sm font-medium ${
                          isCompleted
                            ? "text-slate-400 line-through"
                            : isActive
                              ? "text-slate-900 font-bold"
                              : "text-slate-600"
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Progress Bar */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700">
                  Completion
                </span>
                <span className="text-xs font-bold text-[#1152d4]">
                  {Math.round(completionPercent)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#1152d4] h-full rounded-full transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                  info
                </span>
                Fill all steps and submit to get your application reference.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              to="/visa"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
              Back to Visa Home
            </Link>
            <Link
              to="/contact"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#1152d4]/10 text-[#1152d4] rounded-lg font-bold text-sm hover:bg-[#1152d4]/20 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">
                contact_support
              </span>
              Get Live Help
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 lg:ml-72">
          <div className="max-w-3xl mx-auto">
            {/* Global Submit Error */}
            {submitError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <span className="material-symbols-outlined text-red-500 mt-0.5">
                  error
                </span>
                <div>
                  <p className="text-red-800 font-bold text-sm">
                    Submission Failed
                  </p>
                  <p className="text-red-700 text-sm mt-1">{submitError}</p>
                </div>
                <button
                  onClick={() => setSubmitError("")}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <span className="material-symbols-outlined text-lg">
                    close
                  </span>
                </button>
              </div>
            )}

            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <div>
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Personal Information
                  </h2>
                  <p className="text-slate-500 mt-2 text-lg">
                    Please provide your personal details as they appear on your
                    passport.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      {
                        label: "First Name",
                        key: "firstName",
                        type: "text",
                        placeholder: "As on passport",
                      },
                      {
                        label: "Last Name",
                        key: "lastName",
                        type: "text",
                        placeholder: "As on passport",
                      },
                      {
                        label: "Date of Birth",
                        key: "dateOfBirth",
                        type: "date",
                        placeholder: "",
                      },
                      {
                        label: "Nationality",
                        key: "nationality",
                        type: "text",
                        placeholder: "e.g. Indian",
                      },
                      {
                        label: "Passport Number",
                        key: "passportNumber",
                        type: "text",
                        placeholder: "e.g. A1234567",
                      },
                      {
                        label: "Passport Expiry Date",
                        key: "passportExpiry",
                        type: "date",
                        placeholder: "",
                      },
                      {
                        label: "Email Address",
                        key: "email",
                        type: "email",
                        placeholder: "your@email.com",
                      },
                      {
                        label: "Phone Number",
                        key: "phone",
                        type: "tel",
                        placeholder: "+1 (555) 000-0000",
                      },
                    ].map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {field.label}{" "}
                          {[
                            "firstName",
                            "lastName",
                            "email",
                            "nationality",
                            "passportNumber",
                            "dateOfBirth",
                            "passportExpiry",
                          ].includes(field.key) && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>
                        <input
                          type={field.type}
                          value={personalInfo[field.key]}
                          onChange={(e) => {
                            setPersonalInfo({
                              ...personalInfo,
                              [field.key]: e.target.value,
                            });
                            if (fieldErrors[field.key])
                              setFieldErrors((prev) => ({
                                ...prev,
                                [field.key]: "",
                              }));
                          }}
                          className={inputClass(field.key)}
                          placeholder={field.placeholder}
                        />
                        {fieldErrors[field.key] && (
                          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">
                              error
                            </span>
                            {fieldErrors[field.key]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Travel Details */}
            {currentStep === 2 && (
              <div>
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Travel Details
                  </h2>
                  <p className="text-slate-500 mt-2 text-lg">
                    Tell us about your planned trip and the type of visa you
                    need.
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Destination Country{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={travelDetails.destination}
                        onChange={(e) => {
                          setTravelDetails({
                            ...travelDetails,
                            destination: e.target.value,
                          });
                          if (fieldErrors.destination)
                            setFieldErrors((prev) => ({
                              ...prev,
                              destination: "",
                            }));
                        }}
                        className={inputClass("destination")}
                        placeholder="e.g. Japan"
                      />
                      {fieldErrors.destination && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">
                            error
                          </span>
                          {fieldErrors.destination}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Visa Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={travelDetails.visaType}
                        onChange={(e) =>
                          setTravelDetails({
                            ...travelDetails,
                            visaType: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                      >
                        <option value="tourist">Tourist / Visitor</option>
                        <option value="business">Business</option>
                        <option value="student">Student</option>
                        <option value="transit">Transit</option>
                        <option value="work">Work</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Planned Arrival Date{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={travelDetails.arrivalDate}
                        onChange={(e) => {
                          setTravelDetails({
                            ...travelDetails,
                            arrivalDate: e.target.value,
                          });
                          if (fieldErrors.arrivalDate)
                            setFieldErrors((prev) => ({
                              ...prev,
                              arrivalDate: "",
                            }));
                        }}
                        className={inputClass("arrivalDate")}
                      />
                      {fieldErrors.arrivalDate && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">
                            error
                          </span>
                          {fieldErrors.arrivalDate}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Planned Departure Date{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={travelDetails.departureDate}
                        onChange={(e) => {
                          setTravelDetails({
                            ...travelDetails,
                            departureDate: e.target.value,
                          });
                          if (fieldErrors.departureDate)
                            setFieldErrors((prev) => ({
                              ...prev,
                              departureDate: "",
                            }));
                        }}
                        className={inputClass("departureDate")}
                      />
                      {fieldErrors.departureDate && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">
                            error
                          </span>
                          {fieldErrors.departureDate}
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Accommodation Address
                      </label>
                      <input
                        type="text"
                        value={travelDetails.accommodation}
                        onChange={(e) =>
                          setTravelDetails({
                            ...travelDetails,
                            accommodation: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4]"
                        placeholder="Hotel name or address in destination country"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Purpose of Visit
                      </label>
                      <textarea
                        value={travelDetails.purposeOfVisit}
                        onChange={(e) =>
                          setTravelDetails({
                            ...travelDetails,
                            purposeOfVisit: e.target.value,
                          })
                        }
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1152d4] resize-none"
                        placeholder="Brief description of your travel purpose..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Document Upload */}
            {currentStep === 3 && (
              <div>
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Required Documents
                  </h2>
                  <p className="text-slate-500 mt-2 text-lg">
                    Please upload clear scans or high-quality photos of the
                    following documents.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className={`bg-white rounded-xl p-8 border-2 border-dashed transition-all ${
                        uploadedFiles[doc.id]
                          ? "border-green-300 bg-green-50/30"
                          : "border-slate-200 hover:border-[#1152d4]/50"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                        <div className="w-16 h-16 rounded-xl bg-[#1152d4]/5 text-[#1152d4] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-3xl">
                            {doc.icon}
                          </span>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                            <h3 className="text-lg font-bold text-slate-900">
                              {doc.title}
                            </h3>
                            {doc.crucial && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded font-black uppercase">
                                Crucial
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 text-sm mt-1">
                            {doc.description}
                          </p>
                          <div className="mt-3 flex flex-wrap justify-center md:justify-start gap-2">
                            {doc.formats.map((fmt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center py-1 px-3 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600"
                              >
                                {fmt}
                              </span>
                            ))}
                            <span className="inline-flex items-center py-1 px-3 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                              {doc.maxSize}
                            </span>
                          </div>
                          {uploadedFiles[doc.id] && (
                            <div className="mt-3 flex items-center gap-2 text-green-600 text-sm font-medium">
                              <span className="material-symbols-outlined text-sm">
                                check_circle
                              </span>
                              {uploadedFiles[doc.id].name}
                            </div>
                          )}
                        </div>
                        <label className="mt-4 md:mt-0 flex items-center gap-2 px-6 py-2.5 bg-[#1152d4] text-white rounded-lg font-bold text-sm shadow-md shadow-[#1152d4]/20 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
                          <span className="material-symbols-outlined text-lg">
                            {doc.uploadIcon}
                          </span>
                          {uploadedFiles[doc.id] ? "Replace" : doc.uploadLabel}
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleFileUpload(doc.id, e.target.files[0])
                            }
                          />
                        </label>
                      </div>
                      {uploadErrors[doc.id] && (
                        <p className="mt-3 text-xs font-semibold text-red-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">error</span>
                          {uploadErrors[doc.id]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Warning Notice */}
                <div className="mt-8 p-6 bg-amber-50 border border-amber-100 rounded-xl flex gap-4">
                  <span className="material-symbols-outlined text-amber-600 mt-0.5">
                    warning
                  </span>
                  <div>
                    <p className="text-amber-900 font-bold text-sm leading-none">
                      Important Notice
                    </p>
                    <p className="text-amber-800 text-sm mt-2 leading-relaxed">
                      Ensure all documents are translated into English by a
                      certified translator if they are in another language.
                      Applications with illegible documents will be rejected
                      immediately.
                    </p>
                  </div>
                </div>

                {/* Optional notice for missing docs */}
                {documents.some((d) => d.required && !uploadedFiles[d.id]) && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3">
                    <span className="material-symbols-outlined text-blue-500 mt-0.5 text-sm">
                      info
                    </span>
                    <p className="text-blue-700 text-sm">
                      You can proceed without uploading documents now. Our team
                      will contact you to collect them. However, uploading
                      documents upfront speeds up processing.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review & Pay */}
            {currentStep === 4 && (
              <div>
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                    Service Selection & Final Review
                  </h2>
                  <p className="text-slate-500 mt-2 text-lg">
                    Choose your processing tier and review your application
                    before submitting.
                  </p>
                </div>

                {/* Tier Selection */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {tiers.map((tier) => (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedTier(tier.id)}
                      className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                        selectedTier === tier.id
                          ? "border-[#1152d4] bg-[#1152d4]/5"
                          : "border-slate-200 hover:border-[#1152d4]/40"
                      }`}
                    >
                      {tier.recommended && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1152d4] text-white text-xs px-3 py-1 rounded-full font-bold">
                          Recommended
                        </span>
                      )}
                      <div className="text-2xl font-black text-[#1152d4] mb-1">
                        {tier.price}
                      </div>
                      <div className="font-bold text-slate-900 mb-3">
                        {tier.name}
                      </div>
                      <ul className="space-y-2">
                        {tier.features.map((feature, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-xs text-slate-600"
                          >
                            <span className="material-symbols-outlined text-xs text-green-500">
                              check_circle
                            </span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>

                {/* Application Summary */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1152d4]">
                      summarize
                    </span>
                    Application Summary
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <p className="text-slate-500 font-medium mb-3">
                        Personal Details
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Name</span>
                          <span className="font-medium">
                            {personalInfo.firstName} {personalInfo.lastName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Nationality</span>
                          <span className="font-medium">
                            {personalInfo.nationality || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Passport</span>
                          <span className="font-medium">
                            {personalInfo.passportNumber || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Email</span>
                          <span className="font-medium truncate max-w-[180px]">
                            {personalInfo.email || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium mb-3">
                        Travel Details
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Destination</span>
                          <span className="font-medium">
                            {travelDetails.destination || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Visa Type</span>
                          <span className="font-medium capitalize">
                            {travelDetails.visaType}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Arrival</span>
                          <span className="font-medium">
                            {travelDetails.arrivalDate || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Departure</span>
                          <span className="font-medium">
                            {travelDetails.departureDate || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium mb-3">
                        Documents Uploaded
                      </p>
                      <div className="space-y-2">
                        {documents.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2">
                            <span
                              className={`material-symbols-outlined text-sm ${uploadedFiles[doc.id] ? "text-green-500" : "text-slate-300"}`}
                            >
                              {uploadedFiles[doc.id]
                                ? "check_circle"
                                : "radio_button_unchecked"}
                            </span>
                            <span
                              className={`text-sm ${uploadedFiles[doc.id] ? "text-slate-700" : "text-slate-400"}`}
                            >
                              {doc.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium mb-3">
                        Selected Service
                      </p>
                      <div className="p-3 bg-[#1152d4]/5 rounded-lg border border-[#1152d4]/20">
                        <div className="font-bold text-[#1152d4]">
                          {tiers.find((t) => t.id === selectedTier)?.name}
                        </div>
                        <div className="text-2xl font-black text-slate-900">
                          {tiers.find((t) => t.id === selectedTier)?.price}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Terms notice */}
                  <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">
                      info
                    </span>
                    By submitting this application you agree to our{" "}
                    <Link
                      to="/visa/terms"
                      className="text-[#1152d4] font-semibold hover:underline"
                    >
                      Terms & Conditions
                    </Link>
                    ,{" "}
                    <Link
                      to="/visa/refund-policy"
                      className="text-[#1152d4] font-semibold hover:underline"
                    >
                      Refund Policy
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/visa/privacy"
                      className="text-[#1152d4] font-semibold hover:underline"
                    >
                      Privacy Notice
                    </Link>
                    . Your service fee is collected securely at submission via our
                    payment provider; any government fees are separate.
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t border-slate-200">
              <button
                onClick={handlePrev}
                disabled={currentStep === 1 || isSubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors w-full sm:w-auto justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg">
                  arrow_back
                </span>
                Previous Step
              </button>
              <div className="flex gap-4 w-full sm:w-auto">
                {currentStep < 4 ? (
                  <button
                    onClick={handleNext}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-[#1152d4] text-white rounded-lg font-bold text-sm shadow-xl shadow-[#1152d4]/30 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    {currentStep === 3 ? "Review & Continue" : "Continue"}
                    <span className="material-symbols-outlined text-lg">
                      arrow_forward
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-green-600 text-white rounded-lg font-bold text-sm shadow-xl shadow-green-600/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
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
                        Submitting...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">
                          send
                        </span>
                        Submit Application
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default VisaApplication;
