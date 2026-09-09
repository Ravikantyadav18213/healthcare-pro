// import React from "react";
// import { Link } from "react-router-dom";
// import { FiArrowLeft, FiShield, FiCheck } from "react-icons/fi";

// export default function Privacy() {
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
//               <FiShield size={26} />
//             </div>

//             <div>

//               <h1 className="text-3xl font-bold">
//                 Privacy Policy
//               </h1>

//               <p className="text-sm text-slate-400 mt-1">
//                 Last updated: August 2026
//               </p>

//             </div>

//           </div>


//           <div className="space-y-8">

//             <Section
//               title="1. Information We Collect"
//               text="HealthCare Pro may collect information required to provide and operate healthcare management services. This may include account information, patient information, appointment details and administrative information."
//             />

//             <Section
//               title="2. How We Use Information"
//               text="Information may be used to manage healthcare operations, appointments, patient records, doctors, departments, laboratory, pharmacy, billing and emergency workflows."
//             />

//             <Section
//               title="3. Data Protection"
//               text="We use reasonable technical and organizational measures to help protect information against unauthorized access, alteration or disclosure."
//             />

//             <Section
//               title="4. Information Sharing"
//               text="Information should only be shared with authorized users and services where required for legitimate healthcare management operations."
//             />

//             <Section
//               title="5. Your Responsibilities"
//               text="Users are responsible for maintaining appropriate access controls and keeping account credentials secure."
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
  FiShield,
  FiLock,
  FiDatabase,
  FiUserCheck,
  FiMail,
  FiActivity,
  FiFileText,
} from "react-icons/fi";

import LegalPage from "../components/LegalPage.jsx";

const SECTIONS = [
  {
    icon: FiFileText,
    title: "1. Information We Collect",
    body: "HealthCare Pro may collect account information such as your name, email address, role, and authentication details required to provide access to the hospital management platform.",
  },
  {
    icon: FiUserCheck,
    title: "2. Account Information",
    body: "Profile information is used to identify authorized users and provide features based on the user's role and permissions.",
  },
  {
    icon: FiDatabase,
    title: "3. Healthcare and Application Data",
    body: "Information entered into the application may include patient records, doctor information, appointments, laboratory information, pharmacy information, billing information, and emergency information.",
  },
  {
    icon: FiLock,
    title: "4. Data Security",
    body: "HealthCare Pro is designed with authentication, authorization, protected routes, and secure application practices to help protect information from unauthorized access.",
  },
  {
    icon: FiActivity,
    title: "5. How Information Is Used",
    body: "Information may be used to authenticate users, provide dashboard access, manage hospital workflows, improve application functionality, and maintain application activity records.",
  },
  {
    icon: FiShield,
    title: "6. Authentication and Activity",
    body: "Authentication events and application activity may be recorded to support security, troubleshooting, auditing, and administration.",
  },
  {
    icon: FiMail,
    title: "7. Contact",
    body: "For privacy-related questions, contact support@healthcarepro.com.",
  },
];

export default function Privacy() {
  return (
    <LegalPage
      icon={FiShield}
      eyebrow="Privacy"
      title="Privacy Policy"
      updated="August 2026"
      sections={SECTIONS}
    />
  );
}

