// import React, { useState } from "react";
// import { FiSearch, FiMic } from "react-icons/fi";

// export default function SearchBar({ value, onChange, placeholder = "Search…" }) {
//   const [listening, setListening] = useState(false);

//   // Voice search stub — wires up the Web Speech API where the browser
//   // supports it, otherwise just no-ops. Swap in a fuller implementation
//   // if voice input is a priority.
//   const startVoiceSearch = () => {
//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognition) {
//       alert("Voice search isn't supported in this browser.");
//       return;
//     }
//     const recognition = new SpeechRecognition();
//     recognition.lang = "en-IN";
//     recognition.onstart = () => setListening(true);
//     recognition.onend = () => setListening(false);
//     recognition.onresult = (e) => onChange(e.results[0][0].transcript);
//     recognition.start();
//   };

//   return (
//     <div className="relative flex items-center w-full max-w-sm">
//       <FiSearch className="absolute left-3 text-slate-400" size={16} />
//       <input
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         placeholder={placeholder}
//         className="input-field pl-9 pr-9"
//       />
//       <button
//         onClick={startVoiceSearch}
//         title="Voice search"
//         className={`absolute right-2 p-1 rounded-full ${listening ? "text-red-500 animate-pulse" : "text-slate-400 hover:text-brand-600"}`}
//       >
//         <FiMic size={15} />
//       </button>
//     </div>
//   );
// }



import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FiSearch,
  FiMic,
  FiX,
  FiUsers,
  FiUserCheck,
  FiCalendar,
  FiLayers,
  FiPackage,
  FiActivity,
  FiFileText,
  FiAlertCircle,
  FiBarChart2,
  FiGrid,
} from "react-icons/fi";


const SEARCH_ITEMS = [
  {
    label: "Dashboard",
    description: "Hospital dashboard and overview",
    path: "/dashboard",
    icon: FiGrid,
    keywords: "dashboard home overview hospital",
  },

  {
    label: "Patients",
    description: "Manage patient records",
    path: "/patients",
    icon: FiUsers,
    keywords: "patient patients records users",
  },

  {
    label: "Doctors",
    description: "Manage doctors and medical staff",
    path: "/doctors",
    icon: FiUserCheck,
    keywords: "doctor doctors physician medical staff",
  },

  {
    label: "Appointments",
    description: "Manage appointments and bookings",
    path: "/appointments",
    icon: FiCalendar,
    keywords: "appointment appointments booking bookings schedule",
  },

  {
    label: "Departments",
    description: "Hospital departments",
    path: "/departments",
    icon: FiLayers,
    keywords: "department departments hospital units",
  },

  {
    label: "Pharmacy",
    description: "Medicines and pharmacy management",
    path: "/pharmacy",
    icon: FiPackage,
    keywords: "pharmacy medicine medicines drugs medical",
  },

  {
    label: "Laboratory",
    description: "Laboratory tests and reports",
    path: "/laboratory",
    icon: FiActivity,
    keywords: "laboratory lab labs test tests diagnosis reports",
  },

  {
    label: "Billing",
    description: "Hospital billing and payments",
    path: "/billing",
    icon: FiFileText,
    keywords: "billing bill payment payments invoice invoices",
  },

  {
    label: "Emergency",
    description: "Emergency cases and alerts",
    path: "/emergency",
    icon: FiAlertCircle,
    keywords: "emergency urgent critical ambulance alert",
  },

  {
    label: "Reports",
    description: "Hospital reports and analytics",
    path: "/reports",
    icon: FiBarChart2,
    keywords: "report reports analytics statistics data",
  },
];


/*
 * Normal users only ever reach their own pages,
 * so their quick search never lists admin modules.
 */

const USER_SEARCH_ITEMS = [
  {
    label: "My Dashboard",
    description: "Your personal healthcare overview",
    path: "/dashboard",
    icon: FiGrid,
    keywords: "dashboard home overview personal my",
  },

  {
    label: "Book Appointment",
    description: "Choose a department, doctor and time slot",
    path: "/book-appointment",
    icon: FiCalendar,
    keywords: "book booking new appointment schedule slot visit consult",
  },

  {
    label: "My Appointments",
    description: "Your booked appointments",
    path: "/my-appointments",
    icon: FiCalendar,
    keywords: "appointment appointments booking visit doctor my cancel reschedule",
  },

  {
    label: "My Reports",
    description: "Your personal medical reports",
    path: "/my-reports",
    icon: FiFileText,
    keywords: "report reports lab blood test result results download my",
  },

  {
    label: "Find a Doctor",
    description: "Browse specialists and consultation fees",
    path: "/find-doctors",
    icon: FiUserCheck,
    keywords: "doctor doctors find specialist specialization consultant fee",
  },

  {
    label: "My Profile",
    description: "Your account information",
    path: "/profile",
    icon: FiUsers,
    keywords: "profile account settings me my password",
  },
];

/* A doctor was previously given USER_SEARCH_ITEMS, whose targets are
   all patient-only routes — every result led to a dead-end redirect. */
const DOCTOR_SEARCH_ITEMS = [
  {
    label: "Dashboard",
    description: "Your clinical overview",
    path: "/doctor/dashboard",
    icon: FiGrid,
    keywords: "dashboard home overview",
  },
  {
    label: "My Appointments",
    description: "Your scheduled appointments",
    path: "/doctor/appointments",
    icon: FiCalendar,
    keywords: "appointment appointments schedule visit",
  },
  {
    label: "My Patients",
    description: "Patients under your care",
    path: "/doctor/patients",
    icon: FiUsers,
    keywords: "patient patients my care",
  },
  {
    label: "Reports",
    description: "Reports for your patients",
    path: "/doctor/reports",
    icon: FiFileText,
    keywords: "report reports lab test result results",
  },
  {
    label: "Prescriptions",
    description: "Prescriptions you have written",
    path: "/doctor/prescriptions",
    icon: FiFileText,
    keywords: "prescription prescriptions medicine medication",
  },
  {
    label: "Messages",
    description: "Conversations with patients",
    path: "/doctor/messages",
    icon: FiUsers,
    keywords: "message messages chat conversation",
  },
  {
    label: "My Profile",
    description: "Your account information",
    path: "/doctor/profile",
    icon: FiUsers,
    keywords: "profile account settings me my password",
  },
];


export default function SearchBar({
  value = "",
  onChange,
  placeholder = "Search patients, doctors, appointments...",
  /* No default: every caller must say who is searching. Defaulting to
     "admin" meant a caller that forgot the prop silently handed out
     the full administrator navigation catalogue. */
  role,
}) {

  const navigate = useNavigate();

  const searchItems =
    role === "admin"
      ? SEARCH_ITEMS
      : role === "doctor"
      ? DOCTOR_SEARCH_ITEMS
      : USER_SEARCH_ITEMS;

  const wrapperRef = useRef(null);
  const recognitionRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [open, setOpen] = useState(false);


  const searchText = String(value || "")
    .trim()
    .toLowerCase();


  const results = searchText
    ? searchItems.filter((item) => {

        const searchableText = `
          ${item.label}
          ${item.description}
          ${item.keywords}
        `.toLowerCase();

        return searchableText.includes(searchText);
      })
    : [];


  /* ==================================================
      OPEN RESULT DROPDOWN
  ================================================== */

  useEffect(() => {

    if (searchText.length > 0) {
      setOpen(true);
    }

  }, [searchText]);


  /* ==================================================
      CLICK OUTSIDE
  ================================================== */

  useEffect(() => {

    const handleOutsideClick = (event) => {

      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }

    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };

  }, []);


  /* ==================================================
      ESC KEY
  ================================================== */

  useEffect(() => {

    const handleEscape = (event) => {

      if (event.key === "Escape") {
        setOpen(false);
      }

    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };

  }, []);


  /* ==================================================
      RESULT CLICK
  ================================================== */

  const handleResultClick = (path) => {

    setOpen(false);

    onChange("");

    navigate(path);

  };


  /* ==================================================
      CLEAR SEARCH
  ================================================== */

  const clearSearch = () => {

    onChange("");

    setOpen(false);

  };


  /* ==================================================
      VOICE SEARCH
  ================================================== */

  const startVoiceSearch = () => {

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

      alert(
        "Voice search is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );

      return;
    }


    if (recognitionRef.current) {

      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }

    }


    const recognition =
      new SpeechRecognition();


    recognition.lang = "en-IN";

    recognition.continuous = false;

    recognition.interimResults = false;

    recognition.maxAlternatives = 1;


    recognition.onstart = () => {

      setListening(true);

    };


    recognition.onresult = (event) => {

      const transcript =
        event.results?.[0]?.[0]?.transcript || "";


      onChange(transcript);

      setOpen(true);

    };


    recognition.onerror = (event) => {

      console.error(
        "Voice search error:",
        event.error
      );

      setListening(false);

    };


    recognition.onend = () => {

      setListening(false);

      recognitionRef.current = null;

    };


    recognitionRef.current = recognition;


    try {

      recognition.start();

    } catch (error) {

      console.error(
        "Unable to start voice search:",
        error
      );

      setListening(false);

      recognitionRef.current = null;

    }

  };


  return (

    <div
      ref={wrapperRef}
      className="relative w-full max-w-xl"
    >

      {/* ==================================================
          SEARCH ICON
      ================================================== */}

      <FiSearch
        size={18}
        className="
          absolute
          left-4
          top-1/2
          -translate-y-1/2
          text-slate-400
          pointer-events-none
          z-10
        "
      />


      {/* ==================================================
          INPUT
      ================================================== */}

      <input
        type="text"
        value={value}
        onChange={(event) => {

          const text =
            event.target.value;

          onChange(text);

          setOpen(
            text.trim().length > 0
          );

        }}
        onFocus={() => {

          if (searchText) {
            setOpen(true);
          }

        }}
        onKeyDown={(event) => {

          if (event.key === "Escape") {
            clearSearch();
          }

        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="
          w-full
          h-12

          rounded-xl

          border
          border-slate-200
          dark:border-slate-700

          bg-white
          dark:bg-slate-800

          text-slate-800
          dark:text-slate-100

          placeholder:text-slate-400

          pl-11
          pr-24

          text-sm

          outline-none

          shadow-sm

          transition-all
          duration-200

          focus:border-brand-400
          focus:ring-2
          focus:ring-brand-100

          dark:focus:ring-brand-900/40
        "
      />


      {/* ==================================================
          RIGHT BUTTONS
      ================================================== */}

      <div
        className="
          absolute
          right-2
          top-1/2
          -translate-y-1/2

          flex
          items-center
          gap-1
        "
      >

        {/* Clear */}

        {value && (

          <button
            type="button"
            onClick={clearSearch}
            title="Clear search"
            aria-label="Clear search"
            className="
              w-8
              h-8

              rounded-lg

              flex
              items-center
              justify-center

              text-slate-400

              hover:bg-slate-100
              hover:text-slate-700

              dark:hover:bg-slate-700
              dark:hover:text-white

              transition
            "
          >
            <FiX size={15} />
          </button>

        )}


        {/* Voice */}

        <button
          type="button"
          onClick={startVoiceSearch}
          title={
            listening
              ? "Listening..."
              : "Voice search"
          }
          aria-label={
            listening
              ? "Listening..."
              : "Voice search"
          }
          className={`
            w-8
            h-8

            rounded-lg

            flex
            items-center
            justify-center

            transition-all
            duration-200

            ${
              listening
                ? `
                  bg-red-50
                  text-red-500
                  animate-pulse

                  dark:bg-red-950/30
                `
                : `
                  text-slate-400

                  hover:bg-brand-50
                  hover:text-brand-600

                  dark:hover:bg-slate-700
                  dark:hover:text-brand-400
                `
            }
          `}
        >
          <FiMic size={16} />
        </button>

      </div>


      {/* ==================================================
          RESULTS DROPDOWN
      ================================================== */}

      {open && (

        <div
          className="
            absolute

            left-0
            right-0

            top-[58px]

            z-[100]

            overflow-hidden

            rounded-2xl

            border
            border-slate-200
            dark:border-slate-700

            bg-white
            dark:bg-slate-900

            shadow-2xl
          "
        >

          {results.length > 0 ? (

            <div className="py-2">

              <div
                className="
                  px-4
                  py-2

                  text-[11px]
                  uppercase
                  tracking-wider

                  font-semibold

                  text-slate-400
                "
              >
                Search Results
              </div>


              {results.map((item) => {

                const Icon = item.icon;


                return (

                  <button
                    key={item.path}
                    type="button"
                    onClick={() =>
                      handleResultClick(item.path)
                    }
                    className="
                      w-full

                      px-4
                      py-3

                      flex
                      items-center
                      gap-3

                      text-left

                      hover:bg-slate-50
                      dark:hover:bg-slate-800

                      transition
                    "
                  >

                    <div
                      className="
                        w-10
                        h-10
                        shrink-0

                        rounded-xl

                        bg-brand-50
                        dark:bg-brand-900/30

                        text-brand-600
                        dark:text-brand-300

                        flex
                        items-center
                        justify-center
                      "
                    >
                      <Icon size={18} />
                    </div>


                    <div className="min-w-0">

                      <div
                        className="
                          font-semibold
                          text-sm

                          text-slate-800
                          dark:text-white
                        "
                      >
                        {item.label}
                      </div>


                      <div
                        className="
                          text-xs
                          text-slate-400
                          mt-0.5
                        "
                      >
                        {item.description}
                      </div>

                    </div>

                  </button>

                );

              })}

            </div>

          ) : (

            <div
              className="
                px-5
                py-7

                text-center
              "
            >

              <div
                className="
                  w-11
                  h-11

                  rounded-xl

                  bg-slate-100
                  dark:bg-slate-800

                  text-slate-400

                  flex
                  items-center
                  justify-center

                  mx-auto
                  mb-3
                "
              >
                <FiSearch size={19} />
              </div>


              <p
                className="
                  text-sm
                  font-semibold

                  text-slate-700
                  dark:text-slate-200
                "
              >
                No results found
              </p>


              <p
                className="
                  text-xs
                  text-slate-400
                  mt-1
                "
              >
                {role === "admin"
                  ? "Try Patients, Doctors, Appointments or Pharmacy."
                  : role === "doctor"
                  ? "Try Patients, Appointments or Prescriptions."
                  : "Try Reports, Appointments or Profile."}
              </p>

            </div>

          )}

        </div>

      )}


      {/* ==================================================
          LISTENING
      ================================================== */}

      {listening && (

        <div
          className="
            absolute
            left-4
            -bottom-6

            flex
            items-center
            gap-2

            text-[11px]

            font-medium
            text-red-500
          "
        >

          <span
            className="
              w-1.5
              h-1.5

              rounded-full

              bg-red-500

              animate-pulse
            "
          />

          Listening...

        </div>

      )}

    </div>

  );
}