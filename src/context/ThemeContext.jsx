




// import React, {
//   createContext,
//   useEffect,
//   useState,
// } from "react";

// import { useLocation } from "react-router-dom";

// export const ThemeContext = createContext(null);

// export function ThemeProvider({ children }) {
//   const location = useLocation();

//   /* ==================================================
//       SAVED THEME
//   ================================================== */

//   const [dark, setDark] = useState(() => {
//     return localStorage.getItem("hcp_theme") === "dark";
//   });

//   /* ==================================================
//       PUBLIC PAGES
//       These pages must ALWAYS stay LIGHT
//   ================================================== */

//   const PUBLIC_LIGHT_ROUTES = [
//     "/",
//     "/home",
//     "/login",
//     "/signup",
//     "/privacy",
//     "/terms",
//   ];

//   const isPublicLightPage =
//     PUBLIC_LIGHT_ROUTES.includes(location.pathname);

//   /* ==================================================
//       NOT FOUND ALSO LIGHT
//   ================================================== */

//   const isNotFoundPage =
//     !PUBLIC_LIGHT_ROUTES.includes(location.pathname) &&
//     ![
//       "/dashboard",
//       "/patients",
//       "/doctors",
//       "/appointments",
//       "/departments",
//       "/pharmacy",
//       "/laboratory",
//       "/billing",
//       "/emergency",
//       "/reports",
//       "/profile",
//       "/admin",
//     ].includes(location.pathname);

//   const forceLight =
//     isPublicLightPage || isNotFoundPage;

//   /* ==================================================
//       APPLY THEME
//   ================================================== */

//   useEffect(() => {
//     const root = document.documentElement;

//     /*
//      * Public pages:
//      * Always LIGHT.
//      */
//     if (forceLight) {
//       root.classList.remove("dark");
//       return;
//     }

//     /*
//      * Protected application pages:
//      * Use saved theme.
//      */
//     if (dark) {
//       root.classList.add("dark");
//     } else {
//       root.classList.remove("dark");
//     }
//   }, [dark, forceLight, location.pathname]);

//   /* ==================================================
//       TOGGLE THEME
//   ================================================== */

//   const toggleTheme = () => {
//     /*
//      * Public page par dark mode allowed nahi hai.
//      */
//     if (forceLight) {
//       setDark(false);

//       localStorage.setItem(
//         "hcp_theme",
//         "light"
//       );

//       return;
//     }

//     setDark((current) => {
//       const next = !current;

//       localStorage.setItem(
//         "hcp_theme",
//         next ? "dark" : "light"
//       );

//       return next;
//     });
//   };

//   /* ==================================================
//       FORCE LIGHT
//   ================================================== */

//   const setLightTheme = () => {
//     setDark(false);

//     localStorage.setItem(
//       "hcp_theme",
//       "light"
//     );
//   };

//   /* ==================================================
//       FORCE DARK
//   ================================================== */

//   const setDarkTheme = () => {
//     /*
//      * Public pages par dark force nahi karna.
//      */
//     if (forceLight) {
//       return;
//     }

//     setDark(true);

//     localStorage.setItem(
//       "hcp_theme",
//       "dark"
//     );
//   };

//   return (
//     <ThemeContext.Provider
//       value={{
//         dark: forceLight ? false : dark,
//         toggleTheme,
//         setLightTheme,
//         setDarkTheme,
//         isPublicLightPage: forceLight,
//       }}
//     >
//       {children}
//     </ThemeContext.Provider>
//   );
// }




import React, {
  createContext,
  useEffect,
  useState,
} from "react";

import { useLocation } from "react-router-dom";


export const ThemeContext = createContext(null);


export function ThemeProvider({ children }) {
  const location = useLocation();


  /* ==================================================
      SAVED THEME
  ================================================== */

  const [dark, setDark] = useState(() => {
    return (
      localStorage.getItem("hcp_theme") === "dark"
    );
  });


  /* ==================================================
      ROUTES
  ================================================== */

  const pathname = location.pathname;


  /*
   * These pages are ALWAYS light.
   */
  const ALWAYS_LIGHT_ROUTES = [
    "/",
    "/home",
    "/login",
    "/signup",
  ];


  /*
   * Legal pages can inherit Dashboard theme
   * when opened from the logged-in application.
   */
  const LEGAL_ROUTES = [
    "/privacy",
    "/terms",
  ];


  /*
   * Application routes.
   */
  const APPLICATION_ROUTES = [
    "/dashboard",
    "/my-reports",
    "/my-appointments",
    "/book-appointment",
    "/find-doctors",
    "/patients",
    "/doctors",
    "/appointments",
    "/departments",
    "/pharmacy",
    "/laboratory",
    "/billing",
    "/emergency",
    "/reports",
    "/profile",
    "/admin",
    "/wards",
    "/discharge-summaries",
    "/staff",
    "/my-health",
    "/messages",
    "/admin/messages",
    "/doctor/dashboard",
    "/doctor/appointments",
    "/doctor/patients",
    "/doctor/reports",
    "/doctor/prescriptions",
    "/doctor/messages",
    "/doctor/profile",
  ];

  /* /doctor/patients/:id and /patients/:patientId/timeline are not
     literal matches above. */
  const isDoctorPatientDetail = /^\/doctor\/patients\/[^/]+$/.test(pathname);
  const isPatientTimelineDetail = /^\/patients\/[^/]+\/timeline$/.test(pathname);


  /* ==================================================
      CHECK LEGAL PAGE SOURCE
  ================================================== */

  const legalOpenedFromDashboard =
    LEGAL_ROUTES.includes(pathname) &&
    location.state?.from === "dashboard";


  /* ==================================================
      PUBLIC LIGHT PAGE
  ================================================== */

  const isAlwaysLightPage =
    ALWAYS_LIGHT_ROUTES.includes(pathname);


  /* ==================================================
      LEGAL PAGE FROM HOME
  ================================================== */

  const legalOpenedFromHome =
    LEGAL_ROUTES.includes(pathname) &&
    location.state?.from !== "dashboard";


  /* ==================================================
      UNKNOWN / 404 PAGE
  ================================================== */

  const isApplicationPage =
    APPLICATION_ROUTES.includes(pathname);


  const isUnknownPage =
    !ALWAYS_LIGHT_ROUTES.includes(pathname) &&
    !APPLICATION_ROUTES.includes(pathname) &&
    !LEGAL_ROUTES.includes(pathname) &&
    !isDoctorPatientDetail &&
    !isPatientTimelineDetail;


  /* ==================================================
      SHOULD APPLY DARK MODE?
  ================================================== */

  const shouldUseDarkMode =
    !isAlwaysLightPage &&
    !legalOpenedFromHome &&
    !isUnknownPage &&
    dark;


  /* ==================================================
      APPLY THEME TO HTML
  ================================================== */

  useEffect(() => {
    const root = document.documentElement;


    /*
     * HOME / LOGIN / SIGNUP
     * Always light.
     */
    if (isAlwaysLightPage) {
      root.classList.remove("dark");
      return;
    }


    /*
     * Privacy / Terms opened from Home
     * Stay light.
     */
    if (legalOpenedFromHome) {
      root.classList.remove("dark");
      return;
    }


    /*
     * 404
     * Stay light.
     */
    if (isUnknownPage) {
      root.classList.remove("dark");
      return;
    }


    /*
     * Dashboard / application pages
     * and legal pages opened from Dashboard.
     */
    if (shouldUseDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

  }, [
    pathname,
    dark,
    isAlwaysLightPage,
    legalOpenedFromHome,
    isUnknownPage,
    shouldUseDarkMode,
  ]);


  /* ==================================================
      TOGGLE THEME
  ================================================== */

  const toggleTheme = () => {

    /*
     * Do not allow theme toggle on
     * Home / Login / Signup.
     */
    if (isAlwaysLightPage) {

      setDark(false);

      localStorage.setItem(
        "hcp_theme",
        "light"
      );

      return;
    }


    /*
     * Privacy / Terms opened from Home
     * should remain light.
     */
    if (legalOpenedFromHome) {

      setDark(false);

      localStorage.setItem(
        "hcp_theme",
        "light"
      );

      return;
    }


    /*
     * Application + legal pages opened
     * from Dashboard.
     */
    setDark((current) => {

      const next = !current;

      localStorage.setItem(
        "hcp_theme",
        next
          ? "dark"
          : "light"
      );

      return next;

    });
  };


  /* ==================================================
      FORCE LIGHT
  ================================================== */

  const setLightTheme = () => {

    setDark(false);

    localStorage.setItem(
      "hcp_theme",
      "light"
    );
  };


  /* ==================================================
      FORCE DARK
  ================================================== */

  const setDarkTheme = () => {

    if (
      isAlwaysLightPage ||
      legalOpenedFromHome ||
      isUnknownPage
    ) {
      return;
    }


    setDark(true);

    localStorage.setItem(
      "hcp_theme",
      "dark"
    );
  };


  return (
    <ThemeContext.Provider
      value={{
        /*
         * On legal page opened from Dashboard,
         * return actual saved theme.
         */
        dark: shouldUseDarkMode,

        toggleTheme,
        setLightTheme,
        setDarkTheme,

        isAlwaysLightPage,
        legalOpenedFromDashboard,
        legalOpenedFromHome,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}