




// import React from "react";
// import {
//   FiHeart,
//   FiFacebook,
//   FiTwitter,
//   FiInstagram,
//   FiLinkedin,
//   FiMail,
//   FiPhone,
//   FiMapPin,
// } from "react-icons/fi";

// import { Link } from "react-router-dom";

// export default function Footer({ variant = "full" }) {
//   const currentYear = new Date().getFullYear();

//   /* ==================================================
//      COMPACT FOOTER
//      Used after login / application pages
//   ================================================== */

//   if (variant === "compact") {
//     return (
//       <footer
//         className="
//           mt-auto
//           mx-4
//           mb-4
//           rounded-2xl

//           bg-white
//           dark:bg-slate-900

//           text-slate-700
//           dark:text-slate-300

//           border
//           border-slate-200
//           dark:border-slate-800

//           shadow-sm

//           transition-colors
//           duration-300
//         "
//       >
//         <div className="px-6 py-5">
//           <div
//             className="
//               flex
//               flex-col
//               sm:flex-row
//               items-center
//               justify-between
//               gap-3
//               text-xs
//               sm:text-sm
//             "
//           >
//             {/* Copyright */}
//             <p className="text-slate-600 dark:text-slate-400">
//               © {currentYear} HealthCare Pro. All rights reserved.
//             </p>

//             {/* Legal links */}
//             <div className="flex items-center gap-6">
//               <Link
//                 to="/privacy"
//                 state={{ from: "dashboard" }}
//                 className="
//                   text-slate-600
//                   dark:text-slate-400

//                   hover:text-blue-600
//                   dark:hover:text-blue-400

//                   transition-colors
//                 "
//               >
//                 Privacy Policy
//               </Link>

//               <Link
//                 to="/terms"
//                 state={{ from: "dashboard" }}
//                 className="
//                   text-slate-600
//                   dark:text-slate-400

//                   hover:text-blue-600
//                   dark:hover:text-blue-400

//                   transition-colors
//                 "
//               >
//                 Terms & Conditions
//               </Link>
//             </div>
//           </div>
//         </div>
//       </footer>
//     );
//   }

//   /* ==================================================
//      FULL FOOTER
//      Used on Home page
//   ================================================== */

//   return (
//     <footer
//       className="
//         mt-10
//         bg-white
//         text-slate-700
//         border-t
//         border-slate-200
//         rounded-t-3xl
//         px-8
//         py-10
//       "
//     >
//       <div
//         className="
//           max-w-7xl
//           mx-auto
//           grid
//           grid-cols-1
//           md:grid-cols-2
//           lg:grid-cols-4
//           gap-8
//         "
//       >
//         {/* BRAND */}
//         <div>
//           <div className="flex items-center gap-3 mb-4">
//             <div
//               className="
//                 w-12
//                 h-12
//                 rounded-xl
//                 bg-blue-600
//                 text-white
//                 flex
//                 items-center
//                 justify-center
//               "
//             >
//               <FiHeart size={25} />
//             </div>

//             <h2 className="text-xl font-bold text-slate-900">
//               HealthCare Pro
//             </h2>
//           </div>

//           <p className="text-sm leading-6 text-slate-500 max-w-xs">
//             Smart Hospital Management System for doctors,
//             patients and healthcare organizations.
//           </p>

//           {/* SOCIAL */}
//           <div className="flex gap-3 mt-5">
//             <a
//               href="https://www.facebook.com/"
//               target="_blank"
//               rel="noopener noreferrer"
//               aria-label="Facebook"
//               className="
//                 w-10 h-10 rounded-xl
//                 bg-[#1877F2]
//                 border border-[#1877F2]
//                 text-white
//                 flex items-center justify-center
//                 hover:bg-[#166FE5]
//                 hover:-translate-y-1
//                 hover:shadow-lg
//                 transition-all
//               "
//             >
//               <FiFacebook size={18} />
//             </a>

//             <a
//               href="https://twitter.com/"
//               target="_blank"
//               rel="noopener noreferrer"
//               aria-label="Twitter"
//               className="
//                 w-10 h-10 rounded-xl
//                 bg-[#1DA1F2]
//                 border border-[#1DA1F2]
//                 text-white
//                 flex items-center justify-center
//                 hover:bg-[#168FE0]
//                 hover:-translate-y-1
//                 hover:shadow-lg
//                 transition-all
//               "
//             >
//               <FiTwitter size={18} />
//             </a>

//             <a
//               href="https://www.instagram.com/"
//               target="_blank"
//               rel="noopener noreferrer"
//               aria-label="Instagram"
//               className="
//                 w-10 h-10 rounded-xl
//                 bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]
//                 border-transparent
//                 text-white
//                 flex items-center justify-center
//                 hover:-translate-y-1
//                 hover:scale-105
//                 hover:shadow-lg
//                 transition-all
//               "
//             >
//               <FiInstagram size={18} />
//             </a>

//             <a
//               href="https://www.linkedin.com/"
//               target="_blank"
//               rel="noopener noreferrer"
//               aria-label="LinkedIn"
//               className="
//                 w-10 h-10 rounded-xl
//                 bg-[#0A66C2]
//                 border border-[#0A66C2]
//                 text-white
//                 flex items-center justify-center
//                 hover:bg-[#0959A8]
//                 hover:-translate-y-1
//                 hover:shadow-lg
//                 transition-all
//               "
//             >
//               <FiLinkedin size={18} />
//             </a>
//           </div>
//         </div>

//         {/* QUICK LINKS */}
//         <div>
//           <h3 className="text-slate-900 font-semibold mb-4">
//             Quick Links
//           </h3>

//           <ul className="space-y-3 text-sm">
//             <li>
//               <Link
//                 to="/"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Home
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/dashboard"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Dashboard
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/patients"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Patients
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/doctors"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Doctors
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/appointments"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Appointments
//               </Link>
//             </li>
//           </ul>
//         </div>

//         {/* SERVICES */}
//         <div>
//           <h3 className="text-slate-900 font-semibold mb-4">
//             Services
//           </h3>

//           <ul className="space-y-3 text-sm">
//             <li>
//               <Link
//                 to="/laboratory"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Laboratory
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/pharmacy"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Pharmacy
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/emergency"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Emergency
//               </Link>
//             </li>

//             <li>
//               <Link
//                 to="/reports"
//                 className="text-slate-600 hover:text-blue-600"
//               >
//                 Reports
//               </Link>
//             </li>
//           </ul>
//         </div>

//         {/* CONTACT */}
//         <div>
//           <h3 className="text-slate-900 font-semibold mb-4">
//             Contact
//           </h3>

//           <div className="space-y-4 text-sm">
//             <p className="flex gap-3 items-center text-slate-600">
//               <FiMapPin className="text-blue-600 shrink-0" />
//               Mumbai, India
//             </p>

//             <p className="flex gap-3 items-center text-slate-600">
//               <FiPhone className="text-blue-600 shrink-0" />
//               +91 90210 23697
//             </p>

//             <p className="flex gap-3 items-center text-slate-600 break-all">
//               <FiMail className="text-blue-600 shrink-0" />
//               support@healthcarepro.com
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* BOTTOM */}
//       <div
//         className="
//           max-w-7xl
//           mx-auto
//           border-t
//           border-slate-200
//           mt-8
//           pt-5
//           flex
//           flex-col
//           md:flex-row
//           justify-between
//           gap-3
//           text-xs
//           text-slate-500
//         "
//       >
//         <p>
//           © {currentYear} HealthCare Pro. All rights reserved.
//         </p>

//         <div className="flex gap-5">
//           <Link
//             to="/privacy"
//             className="hover:text-blue-600 transition-colors"
//           >
//             Privacy Policy
//           </Link>

//           <Link
//             to="/terms"
//             className="hover:text-blue-600 transition-colors"
//           >
//             Terms & Conditions
//           </Link>
//         </div>
//       </div>
//     </footer>
//   );
// }





import React from "react";
import {
  FiFacebook,
  FiTwitter,
  FiInstagram,
  FiLinkedin,
  FiMail,
  FiPhone,
  FiMapPin,
} from "react-icons/fi";

import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";

export default function Footer({ variant = "full" }) {
  const currentYear = new Date().getFullYear();

  /* ==================================================
     COMPACT FOOTER
     Used after login / application pages
  ================================================== */

  if (variant === "compact") {
    return (
      <footer
        className="
          mt-auto
          mx-4
          mb-4
          rounded-2xl
          overflow-hidden

          bg-white
          dark:bg-slate-900

          text-slate-700
          dark:text-slate-300

          border
          border-slate-200
          dark:border-slate-800

          shadow-sm

          transition-all
          duration-300
        "
      >
        <div className="px-6 py-5">
          <div
            className="
              flex
              flex-col
              sm:flex-row
              items-center
              justify-between
              gap-3

              text-xs
              sm:text-sm
            "
          >
            {/* Copyright */}
            <p className="text-slate-600 dark:text-slate-400">
              © {currentYear} HealthCare Pro. All rights reserved.
            </p>

            {/* Legal Links */}
            <div className="flex items-center gap-6">
              <Link
                to="/privacy"
                state={{ from: "dashboard" }}
                className="
                  text-slate-600
                  dark:text-slate-400

                  hover:text-blue-600
                  dark:hover:text-blue-400

                  transition-colors
                "
              >
                Privacy Policy
              </Link>

              <Link
                to="/terms"
                state={{ from: "dashboard" }}
                className="
                  text-slate-600
                  dark:text-slate-400

                  hover:text-blue-600
                  dark:hover:text-blue-400

                  transition-colors
                "
              >
                Terms & Conditions
              </Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  /* ==================================================
     FULL FOOTER
     Used on Home page
  ================================================== */

  return (
    <footer
      className="
        mt-10

        bg-white
        text-slate-700

        border-t
        border-slate-200

        rounded-t-3xl

        px-8
        py-10
      "
    >
      <div
        className="
          max-w-7xl
          mx-auto

          grid
          grid-cols-1
          md:grid-cols-2
          lg:grid-cols-4

          gap-8
        "
      >
        {/* ==================================================
            BRAND
        ================================================== */}

        <div>
          <div className="flex items-center gap-3 mb-4">
            <Logo className="w-12 h-12 shrink-0" />

            <h2 className="text-xl font-bold text-slate-900">
              HealthCare Pro
            </h2>
          </div>

          <p className="text-sm leading-6 text-slate-500 max-w-xs">
            Smart Hospital Management System for doctors,
            patients and healthcare organizations.
          </p>

          {/* ==================================================
              SOCIAL MEDIA
          ================================================== */}

          <div className="flex gap-3 mt-5">
            {/* Facebook */}

            <a
              href="https://www.facebook.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              title="Facebook"
              className="
                w-10
                h-10
                rounded-xl

                bg-[#1877F2]
                border
                border-[#1877F2]

                text-white

                flex
                items-center
                justify-center

                hover:bg-[#166FE5]
                hover:-translate-y-1
                hover:shadow-lg

                transition-all
                duration-200
              "
            >
              <FiFacebook size={18} />
            </a>

            {/* Twitter */}

            <a
              href="https://twitter.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
              title="Twitter"
              className="
                w-10
                h-10
                rounded-xl

                bg-[#1DA1F2]
                border
                border-[#1DA1F2]

                text-white

                flex
                items-center
                justify-center

                hover:bg-[#168FE0]
                hover:-translate-y-1
                hover:shadow-lg

                transition-all
                duration-200
              "
            >
              <FiTwitter size={18} />
            </a>

            {/* Instagram */}

            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              title="Instagram"
              className="
                w-10
                h-10
                rounded-xl

                bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]

                border-transparent
                text-white

                flex
                items-center
                justify-center

                hover:-translate-y-1
                hover:scale-105
                hover:shadow-lg

                transition-all
                duration-200
              "
            >
              <FiInstagram size={18} />
            </a>

            {/* LinkedIn */}

            <a
              href="https://www.linkedin.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              title="LinkedIn"
              className="
                w-10
                h-10
                rounded-xl

                bg-[#0A66C2]
                border
                border-[#0A66C2]

                text-white

                flex
                items-center
                justify-center

                hover:bg-[#0959A8]
                hover:-translate-y-1
                hover:shadow-lg

                transition-all
                duration-200
              "
            >
              <FiLinkedin size={18} />
            </a>
          </div>
        </div>

        {/* ==================================================
            QUICK LINKS
        ================================================== */}

        <div>
          <h3 className="text-slate-900 font-semibold mb-4">
            Quick Links
          </h3>

          <ul className="space-y-3 text-sm">
            <li>
              <Link
                to="/"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Home
              </Link>
            </li>

            <li>
              <Link
                to="/dashboard"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Dashboard
              </Link>
            </li>

            <li>
              <Link
                to="/patients"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Patients
              </Link>
            </li>

            <li>
              <Link
                to="/doctors"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Doctors
              </Link>
            </li>

            <li>
              <Link
                to="/appointments"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Appointments
              </Link>
            </li>
          </ul>
        </div>

        {/* ==================================================
            SERVICES
        ================================================== */}

        <div>
          <h3 className="text-slate-900 font-semibold mb-4">
            Services
          </h3>

          <ul className="space-y-3 text-sm">
            <li>
              <Link
                to="/laboratory"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Laboratory
              </Link>
            </li>

            <li>
              <Link
                to="/pharmacy"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Pharmacy
              </Link>
            </li>

            <li>
              <Link
                to="/emergency"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Emergency
              </Link>
            </li>

            <li>
              <Link
                to="/reports"
                className="
                  text-slate-600
                  hover:text-blue-600
                  transition-colors
                "
              >
                Reports
              </Link>
            </li>
          </ul>
        </div>

        {/* ==================================================
            CONTACT
        ================================================== */}

        <div>
          <h3 className="text-slate-900 font-semibold mb-4">
            Contact
          </h3>

          <div className="space-y-4 text-sm">
            <p className="flex gap-3 items-center text-slate-600">
              <FiMapPin className="text-blue-600 shrink-0" />
              Mumbai, India
            </p>

            <p className="flex gap-3 items-center text-slate-600">
              <FiPhone className="text-blue-600 shrink-0" />
              +91 90210 23697
            </p>

            <p className="flex gap-3 items-center text-slate-600 break-all">
              <FiMail className="text-blue-600 shrink-0" />
              support@healthcarepro.com
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================
          BOTTOM
      ================================================== */}

      <div
        className="
          max-w-7xl
          mx-auto

          border-t
          border-slate-200

          mt-8
          pt-5

          flex
          flex-col
          md:flex-row

          justify-between
          gap-3

          text-xs
          text-slate-500
        "
      >
        <p>
          © {currentYear} HealthCare Pro. All rights reserved.
        </p>

        <div className="flex gap-5">
          <Link
            to="/privacy"
            className="
              hover:text-blue-600
              transition-colors
            "
          >
            Privacy Policy
          </Link>

          <Link
            to="/terms"
            className="
              hover:text-blue-600
              transition-colors
            "
          >
            Terms & Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
}