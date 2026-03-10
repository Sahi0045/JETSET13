# JetSetters Visa Section

This folder contains the complete Visa Application and Management system for JetSetters, covering both the customer-facing portal and the admin/consultant dashboard.

## Folder Structure

```text
visa/
├── admin/                  # Admin & Consultant Dashboard screens
│   ├── AdminDocumentReview.jsx    # Interface for reviewing uploaded documents
│   ├── AdminMessagingHub.jsx      # Multi-chat system for applicant support
│   ├── AppointmentDetail.jsx      # Preparation and details for specific appointments
│   ├── ConsultantDashboard.jsx      # Consultant schedule and queue management
│   ├── DocumentServicesList.jsx    # List of document service requests
│   ├── VisaAdminDashboard.jsx     # High-level stats and overview for admins
│   ├── VisaAdminPanel.jsx         # Central router and layout for admin pages
│   ├── VisaApplicationDetail.jsx  # Detailed view of a single visa application
│   ├── VisaApplicationsList.jsx   # Tabbed list of all applications by status
│   └── VisaRequirementsManager.jsx # CRUD interface for visa rules and requirements
├── ConsultationBooking.jsx  # Step-by-step booking flow for visa consultations
├── CustomerStatusDashboard.jsx # Overview for users to see their active applications
├── DocumentServices.jsx     # Portal for requesting secondary document services
├── VideoConsultation.jsx    # Virtual meeting room and prep for consultants/users
├── VisaApplication.jsx      # Multi-step visa application form
├── VisaApplicationSuccess.jsx # Confirmation page after submission
├── VisaApplicationTracker.jsx # Timeline and status tracker for specific applications
├── VisaLanding.jsx          # Entry point with eligibility checker
└── visa-styles.css          # Shared styles and animations for the visa section
```

## Key Features

### Customer Portal
- **Eligibility Checker**: Quick search for visa requirements based on nationality and destination.
- **Dynamic Application Form**: Guided multi-step process for various visa types.
- **Real-time Tracking**: Live status updates and historical timeline of application progress.
- **Document Services**: Integrated requests for translations, attestations, and insurance.
- **Consultation Suite**: Integrated video meeting room and preparation checklist.

### Admin & Consultant Suite
- **Centralized Layout**: All admin pages share a consistent Navbar and Footer via `VisaAdminPanel.jsx`.
- **Applications Management**: Powerful filtering and status management for all visitor files.
- **Adjudication Tools**: Dedicated document review system with zoom/rotate and feedback loop.
- **Communication Hub**: Real-time messaging system to coordinate with applicants.
- **Consultant Workflow**: Availability management, appointment scheduling, and KPI tracking.

## Technical Notes
- **Styling**: Uses Tailwind CSS with a premium design language (vibrant blues, dark mode elements, and glassmorphism).
- **Navigation**: Integrated with `react-router-dom` for seamless SPA experience.
- **Responsiveness**: All pages are optimized for mobile and desktop, featuring collapsible sidebars and responsive grids.
