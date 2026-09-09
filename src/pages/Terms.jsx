// import React from "react";
// import { Link } from "react-router-dom";
// import { FiArrowLeft, FiFileText, FiCheck } from "react-icons/fi";

// export default function Terms() {
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">

//       {/* Header */}

//       <header className="sticky top-4 z-50 px-4">

//         <nav className="max-w-6xl mx-auto glass px-5 py-3 flex items-center justify-between">

//           <Link
//             to="/"
//             className="flex items-center gap-3"
//           >

//             <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center text-xl font-bold">
//               +
//             </div>

//             <div>

//               <div className="font-bold">
//                 HealthCare Pro
//               </div>

//               <div className="text-xs text-slate-400">
//                 Hospital Management
//               </div>

//             </div>

//           </Link>


//           <Link
//             to="/"
//             className="btn-secondary text-sm flex items-center gap-2"
//           >
//             <FiArrowLeft />
//             Home
//           </Link>

//         </nav>

//       </header>


//       <main className="max-w-4xl mx-auto px-6 py-16">

//         <div className="glass-card">

//           <div className="flex items-center gap-4 mb-8">

//             <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center">
//               <FiFileText size={26} />
//             </div>

//             <div>

//               <h1 className="text-3xl font-bold">
//                 Terms & Conditions
//               </h1>

//               <p className="text-sm text-slate-400 mt-1">
//                 Last updated: August 2026
//               </p>

//             </div>

//           </div>


//           <div className="space-y-8">

//             <Section
//               title="1. Acceptance of Terms"
//               text="By accessing or using HealthCare Pro, you agree to comply with these terms and conditions."
//             />

//             <Section
//               title="2. Platform Usage"
//               text="HealthCare Pro is intended to help healthcare teams manage hospital operations including patients, doctors, appointments, departments, pharmacy, laboratory, billing and emergency information."
//             />

//             <Section
//               title="3. Account Security"
//               text="Users are responsible for maintaining the confidentiality of their account credentials and for activities performed using their account."
//             />

//             <Section
//               title="4. User Responsibilities"
//               text="Users should provide accurate information and use the platform in accordance with applicable policies and organizational requirements."
//             />

//             <Section
//               title="5. Service Availability"
//               text="We aim to maintain reliable access to the platform, but availability may occasionally be affected by maintenance, updates or technical issues."
//             />

//           </div>


//           <div className="mt-10 pt-8 border-t border-slate-200">

//             <Link
//               to="/"
//               className="btn-primary inline-flex items-center gap-2"
//             >
//               <FiArrowLeft />
//               Back to Home
//             </Link>

//           </div>

//         </div>

//       </main>

//     </div>
//   );
// }


// function Section({ title, text }) {
//   return (
//     <section>

//       <div className="flex items-start gap-3">

//         <div className="mt-1 text-emerald-500">
//           <FiCheck size={18} />
//         </div>

//         <div>

//           <h2 className="text-lg font-bold">
//             {title}
//           </h2>

//           <p className="text-slate-500 leading-7 mt-2">
//             {text}
//           </p>

//         </div>

//       </div>

//     </section>
//   );
// }



import React from "react";
import {
  FiFileText,
  FiUserCheck,
  FiShield,
  FiAlertCircle,
  FiActivity,
  FiMail,
  FiRefreshCw,
  FiDatabase,
} from "react-icons/fi";

import LegalPage from "../components/LegalPage.jsx";

const SECTIONS = [
  {
    icon: FiFileText,
    title: "1. Acceptance of Terms",
    body: "By accessing or using HealthCare Pro, you agree to follow these Terms & Conditions. If you do not agree with these terms, you should not use the application.",
  },
  {
    icon: FiUserCheck,
    title: "2. User Accounts",
    body: "Users are responsible for providing accurate account information and maintaining the security of their login credentials.",
  },
  {
    icon: FiActivity,
    title: "3. Platform Usage",
    body: "HealthCare Pro provides tools for managing patients, doctors, appointments, departments, pharmacy, laboratory, billing, emergency information, and reporting workflows.",
  },
  {
    icon: FiShield,
    title: "4. Security and Access",
    body: "Access to protected application sections is restricted to authenticated users. Administrative functionality may be restricted to authorized administrators.",
  },
  {
    icon: FiAlertCircle,
    title: "5. Responsible Use",
    body: "Users must not misuse the application, attempt unauthorized access, interfere with application functionality, or use the platform for unlawful activities.",
  },
  {
    icon: FiRefreshCw,
    title: "6. Application Availability",
    body: "Features and functionality may be updated, changed, improved, or temporarily unavailable as the platform evolves.",
  },
  {
    icon: FiDatabase,
    title: "7. Data and Records",
    body: "Users are responsible for ensuring that information entered into the platform is accurate, appropriate, and handled according to their organization's policies and applicable requirements.",
  },
  {
    icon: FiMail,
    title: "8. Contact",
    body: "Questions about these Terms & Conditions can be sent to support@healthcarepro.com.",
  },
];

export default function Terms() {
  return (
    <LegalPage
      icon={FiFileText}
      eyebrow="Legal"
      title="Terms & Conditions"
      updated="August 2026"
      sections={SECTIONS}
    />
  );
}

