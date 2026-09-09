


import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Logo from "../components/Logo.jsx";
import publicService from "../services/publicService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";

import {
  FiArrowRight,
  FiCheck,
  FiPlay,
  FiUsers,
  FiCalendar,
  FiActivity,
  FiShield,
  FiHeart,
  FiFacebook,
  FiInstagram,
  FiTwitter,
  FiLinkedin,
  FiMail,
  FiPhone,
  FiMapPin,
  FiX,
  FiHome,
  FiInfo,
  FiGrid,
  FiStar,
  FiChevronRight,
} from "react-icons/fi";

const NAV_LINKS = [
  { href: "#home", labelKey: "home.nav.home", label: "Home", icon: FiHome },
  { href: "#about", labelKey: "home.nav.about", label: "About", icon: FiInfo },
  { href: "#services", labelKey: "home.nav.services", label: "Services", icon: FiGrid },
  { href: "#features", labelKey: "home.nav.features", label: "Features", icon: FiStar },
  { href: "#contact", labelKey: "home.nav.contact", label: "Contact", icon: FiMail },
];

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();

  /* Phone navigation. There is no room for five links in the bar, so
     below md they move into a drawer opened from the logo. */
  const [menuOpen, setMenuOpen] = React.useState(false);

  /* Contact form: posts to the public /contact endpoint, which both
     emails the message and saves it for the admin view. */
  const [contactForm, setContactForm] = React.useState({
    name: "",
    email: "",
    message: "",
  });
  const [contactErrors, setContactErrors] = React.useState({});
  const [contactSending, setContactSending] = React.useState(false);

  const updateContact = (field) => (event) => {
    setContactForm((current) => ({ ...current, [field]: event.target.value }));
    setContactErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submitContact = async (event) => {
    event.preventDefault();
    setContactSending(true);
    setContactErrors({});

    try {
      await publicService.submitContact(contactForm);
      toast.success("Message sent — we'll get back to you soon.");
      setContactForm({ name: "", email: "", message: "" });
    } catch (caught) {
      if (caught?.errors) {
        setContactErrors(caught.errors);
      } else {
        toast.error(caught?.message || "Could not send your message. Please try again.");
      }
    } finally {
      setContactSending(false);
    }
  };

  /*
   * The hero clip is decoration, so it is not played for anyone who
   * has asked the system to reduce motion. Read once and then kept in
   * sync, because the setting can change while the page is open.
   */
  const [reduceMotion, setReduceMotion] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event) => setReduceMotion(event.matches);

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const services = [
    {
      labelKey: "nav.laboratory",
      label: "Laboratory",
      textKey: "home.services.laboratoryText",
      text: "Manage laboratory information quickly and efficiently.",
      path: "/laboratory",
    },
    {
      labelKey: "nav.pharmacy",
      label: "Pharmacy",
      textKey: "home.services.pharmacyText",
      text: "Manage pharmacy information quickly and efficiently.",
      path: "/pharmacy",
    },
    {
      labelKey: "nav.emergency",
      label: "Emergency",
      textKey: "home.services.emergencyText",
      text: "Manage emergency information quickly and efficiently.",
      path: "/emergency",
    },
    {
      labelKey: "nav.reports",
      label: "Reports",
      textKey: "home.services.reportsText",
      text: "Manage reports information quickly and efficiently.",
      path: "/reports",
    },
  ];

  const features = [
    { key: "home.feature.securePlatform", text: "Secure healthcare platform" },
    { key: "home.feature.easyAppointments", text: "Easy appointment management" },
    { key: "home.feature.digitalRecords", text: "Digital patient records" },
    {
      key: "home.feature.labPharmacy",
      text: "Laboratory and pharmacy management",
    },
    { key: "home.feature.emergencySupport", text: "Emergency support" },
    { key: "home.feature.centralized", text: "Centralized hospital management" },
  ];

  const openProtectedPage = (path) => {
    navigate("/login", {
      state: {
        from: path,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 text-slate-800">

      {/* ==================================================
          NAVBAR
      ================================================== */}

      {/*
        Full-bleed bar: no horizontal padding on the header and no
        max-width on the nav, so it spans the whole viewport. The
        frosted look is written out here rather than using .glass,
        which would round the corners and outline all four sides.
      */}
      <header
        className="
          sticky top-0 z-50
          w-full
          bg-white/90 backdrop-blur-xl
          border-b border-slate-200/70
          shadow-sm
        "
      >
        <nav className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 md:gap-3 lg:gap-6">

          {/* Logo — opens the drawer on phones, links home above md */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="md:hidden flex items-center gap-2.5 min-w-0"
          >
            <Logo className="w-11 h-11 shrink-0" />

            <div className="min-w-0 text-left">
              <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
                HealthCare Pro
              </h1>

              <p className="text-[10px] sm:text-xs text-slate-400 leading-tight truncate">
                {t("home.brand.tagline", "Hospital Management")}
              </p>
            </div>
          </button>

          <Link
            to="/"
            className="hidden md:flex items-center gap-3 shrink-0"
          >
            <Logo className="w-11 h-11 shrink-0" />

            <div>
              <h1 className="font-bold text-lg leading-tight">
                HealthCare Pro
              </h1>

              <p className="text-xs text-slate-400">
                {t("home.brand.tagline", "Hospital Management")}
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-4 lg:gap-7 text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="hover:text-brand-600 transition"
              >
                {t(link.labelKey, link.label)}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">

            <Link
              to="/login"
              className="hidden sm:block px-2 lg:px-4 py-2 text-sm font-semibold hover:text-brand-600"
            >
              {t("action.signIn", "Sign In")}
            </Link>

            <Link
              to="/signup"
              className="btn-primary text-sm shrink-0 whitespace-nowrap"
            >
              {t("home.cta.getStarted", "Get Started")}
            </Link>

          </div>

        </nav>
      </header>

      {/* ==================================================
          PHONE MENU

          Always mounted and moved with a transform rather than
          conditionally rendered, so opening and closing both animate.
          It sits above the sticky header (z-50).
      ================================================== */}

      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200 ${
          menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`md:hidden fixed inset-y-0 left-0 z-[85] w-[82%] max-w-xs flex flex-col bg-white border-r border-slate-200 shadow-2xl transition-transform duration-300 ease-out ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-4 bg-gradient-to-br from-brand-50 to-white border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="w-10 h-10 shrink-0" />

            <div className="min-w-0">
              <p className="font-bold text-slate-800 leading-tight">
                HealthCare Pro
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {t("home.brand.tagline", "Hospital Management")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            tabIndex={menuOpen ? 0 : -1}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 transition"
          >
            <FiX size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t("home.menu.browse", "Browse")}
          </p>

          {NAV_LINKS.map(({ href, labelKey, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.9375rem] font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              <span className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-brand-100 group-hover:text-brand-600 transition-colors">
                <Icon size={16} />
              </span>

              <span className="flex-1">{t(labelKey, label)}</span>

              <FiChevronRight
                size={15}
                className="shrink-0 text-slate-300 group-hover:text-brand-400 transition-colors"
              />
            </a>
          ))}
        </nav>

        {/*
          pb clears the home indicator on a phone; `btn-primary` is an
          inline rule with no display of its own, so the button needs
          flex here for w-full to mean anything.
        */}
        <div className="border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2.5">
          <Link
            to="/login"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="flex w-full items-center justify-center px-4 h-11 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
          >
            {t("action.signIn", "Sign In")}
          </Link>

          <Link
            to="/signup"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="btn-primary flex w-full items-center justify-center gap-2 h-11 text-sm"
          >
            {t("home.cta.getStarted", "Get Started")}
            <FiArrowRight size={15} />
          </Link>
        </div>
      </aside>


      {/* ==================================================
          HERO
      ================================================== */}

      <main id="home">

        {/* ==================================================
            VIDEO ZONE — hero, stats, and WHY HEALTHCARE PRO

            The clip is a decorative layer held still by `sticky`
            while these three sections scroll over it. Sticky is used
            rather than fixed so the layer stays in flow: it is
            bounded by this wrapper and lets go by itself once the
            wrapper is behind us, with no scroll listener anywhere.
            The <video> element is mounted once and never re-rendered,
            so scrolling cannot pause, restart or freeze playback.

            It is muted, looped and hidden from assistive technology,
            and anyone who has asked the system for less motion gets
            the still gradient instead.
        ================================================== */}

        {/*
          overflow-clip, not hidden: clip keeps the overhanging video
          inside the zone without turning this element into a scroll
          container, which is what would break the sticky anchor.
        */}
        <div className="relative overflow-clip mt-[calc(-1*var(--nav-h))]">

          <div aria-hidden="true" className="sticky top-0 z-0 h-0">

            {/*
              A dark base under the clip. The scrims are tuned against
              mid-tone footage, so without it — reduce-motion on, or the
              file failing to load — they would sit on the light page
              gradient instead and the light copy would lose contrast.
              The playing video covers this completely.
            */}
            {/*
              Inset by the bar height so the clip sits below it rather
              than behind it — the subjects are near the top of the
              frame and were being covered. The anchor still starts at
              the very top of the page, so nothing shifts on scroll.
            */}
            <div className="absolute inset-x-0 top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))] overflow-hidden bg-slate-900">

            {!reduceMotion && (
              <video
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                controls={false}
                aria-hidden="true"
                tabIndex={-1}
              >
                <source src="/video/healthcare.mp4" type="video/mp4" />
              </video>
            )}

            {/*
              Scrims. The flat layer lifts the whole frame off the
              footage; the gradient is heavier on the left, where the
              text sits, and fades to nothing on the right so the clip
              still reads as a clip.
            */}
            <div className="absolute inset-0 bg-slate-950/40" />

            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/50 via-slate-950/45 via-70% to-slate-950/15" />


            </div>

          </div>

          {/* Everything in the zone rides above the clip. */}
          <div className="relative z-10">

        <section className="relative">

          <div className="relative z-10 max-w-7xl mx-auto px-6 pb-20 lg:pb-28 pt-[calc(var(--nav-h)+2.5rem)] lg:pt-[calc(var(--nav-h)+3.5rem)]">

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="max-w-2xl"
            >

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-white text-sm font-semibold mb-6">
                <FiHeart size={16} />
                {t("home.hero.badge", "Smart Healthcare Management")}
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
                {t("home.hero.headingLine1", "Modern healthcare")}

                {/*
                  bg-clip-text paints only inside the element box, and
                  leading-[1.05] makes that box shorter than the glyphs —
                  the descender on the g was being cut. The padding gives
                  the ink room; the matching negative margin keeps the
                  line spacing exactly where it was.
                */}
                <span className="block pb-[0.22em] -mb-[0.22em] bg-gradient-to-r from-brand-400 to-sky-300 bg-clip-text text-transparent">
                  {t("home.hero.headingLine2", "management made")}
                </span>

                <span className="block">
                  {t("home.hero.headingLine3", "simple.")}
                </span>
              </h1>

              <p className="mt-7 text-base sm:text-lg leading-8 text-slate-300 max-w-xl">
                {t(
                  "home.hero.subtitle",
                  "HealthCare Pro provides a centralized platform where healthcare teams can manage patients, doctors, appointments, departments, pharmacy, laboratory, billing and emergency information."
                )}
              </p>

              <div className="flex flex-wrap gap-3 mt-8">

                <Link
                  to="/signup"
                  className="btn-primary flex items-center gap-2"
                >
                  {t("home.cta.getStarted", "Get Started")}
                  <FiArrowRight />
                </Link>

                <a
                  href="#services"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/25 bg-white/10 backdrop-blur-md text-white font-semibold text-sm hover:bg-white/20 transition-colors"
                >
                  <FiPlay size={16} />
                  {t("home.hero.explore", "Explore Platform")}
                </a>

              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-3 mt-8 text-sm text-slate-300">

                <span className="flex items-center gap-2">
                  <FiCheck className="text-emerald-400" />
                  {t("home.hero.checkSecure", "Secure platform")}
                </span>

                <span className="flex items-center gap-2">
                  <FiCheck className="text-emerald-400" />
                  {t("home.hero.checkEasy", "Easy to use")}
                </span>

                <span className="flex items-center gap-2">
                  <FiCheck className="text-emerald-400" />
                  {t("home.hero.check247", "24/7 access")}
                </span>

              </div>

            </motion.div>

            {/*
              The three notes that used to float on the video card.
              They keep their meaning here, sitting on the footage
              itself instead of on a second copy of it.
            */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="grid sm:grid-cols-3 gap-3 mt-12 max-w-3xl"
            >

              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-semibold text-white">
                  {t("home.hero.cardPlatform", "Healthcare Platform")}
                </span>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-emerald-400/20 text-emerald-300 flex items-center justify-center">
                  <FiCheck size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">
                    {t("home.hero.cardConnected", "Everything connected")}
                  </span>
                  <span className="block text-xs text-slate-300 truncate">
                    {t("home.hero.cardConnectedText", "One healthcare platform")}
                  </span>
                </span>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3">
                <span className="block text-xl font-extrabold text-white leading-tight">
                  24/7
                </span>
                <span className="block text-xs text-slate-300">
                  {t("home.hero.cardSupport", "Healthcare support")}
                </span>
              </div>

            </motion.div>

          </div>

        </section>


        {/* ==================================================
            STATS
        ================================================== */}

        <section className="max-w-7xl mx-auto px-6 pb-20">

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <Stat
              icon={FiUsers}
              number="248+"
              label={t("home.stats.patients", "Patients Managed")}
            />

            <Stat
              icon={FiCalendar}
              number="36+"
              label={t("home.stats.appointments", "Appointments Daily")}
            />

            <Stat
              icon={FiActivity}
              number="42+"
              label={t("home.stats.doctors", "Healthcare Doctors")}
            />

            <Stat
              icon={FiShield}
              number="99.9%"
              label={t("home.stats.reliability", "Platform Reliability")}
            />

          </div>

        </section>


        {/* ==================================================
            ABOUT
        ================================================== */}

        <section
          id="about"
          className="py-24"
        >

          <div className="max-w-7xl mx-auto px-6">

            <div className="grid lg:grid-cols-2 gap-14 items-center">

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >

                <span className="text-sm font-bold tracking-widest text-brand-200">
                  {t("home.about.eyebrow", "WHY HEALTHCARE PRO")}
                </span>

                <h2 className="text-4xl lg:text-5xl font-bold mt-3 text-white">
                  {t(
                    "home.about.heading",
                    "Built to make healthcare management easier."
                  )}
                </h2>

                <p className="mt-6 text-slate-200 leading-8">
                  {t(
                    "home.about.text",
                    "HealthCare Pro brings important hospital operations into one easy-to-use platform. Teams can access information, coordinate appointments and manage day-to-day healthcare workflows efficiently."
                  )}
                </p>

                <div className="mt-7 space-y-4">

                  {features.map((feature) => (

                    <div
                      key={feature.key}
                      className="flex items-center gap-3"
                    >

                      <div className="w-7 h-7 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center">
                        <FiCheck size={16} />
                      </div>

                      <span className="text-slate-200">
                        {t(feature.key, feature.text)}
                      </span>

                    </div>

                  ))}

                </div>

                <Link
                  to="/signup"
                  className="btn-primary inline-flex items-center gap-2 mt-8"
                >
                  {t("home.cta.getStarted", "Get Started")}
                  <FiArrowRight />
                </Link>

              </motion.div>


              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="glass-dark-card"
              >

                <div className="grid grid-cols-2 gap-4">

                  <InfoCard
                    icon={FiUsers}
                    title={t("nav.patients", "Patients")}
                    text={t("home.about.patientsText", "Centralized patient records")}
                  />

                  <InfoCard
                    icon={FiCalendar}
                    title={t("nav.appointments", "Appointments")}
                    text={t(
                      "home.about.appointmentsText",
                      "Simple appointment scheduling"
                    )}
                  />

                  <InfoCard
                    icon={FiActivity}
                    title={t("nav.laboratory", "Laboratory")}
                    text={t("home.about.laboratoryText", "Manage lab information")}
                  />

                  <InfoCard
                    icon={FiShield}
                    title={t("home.about.securityTitle", "Security")}
                    text={t("home.about.securityText", "Protected healthcare data")}
                  />

                </div>

              </motion.div>

            </div>

          </div>

        </section>


        {/* ==================================================
            SERVICES
        ================================================== */}

        <section
          id="services"
          className="py-24"
        >

          <div className="max-w-7xl mx-auto px-6">

            <motion.div
              initial={{
                opacity: 0,
                y: 20,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: true,
              }}
              className="text-center max-w-2xl mx-auto"
            >

              <span className="text-sm font-bold tracking-widest text-brand-200">
                {t("home.services.eyebrow", "SERVICES")}
              </span>

              <h2 className="text-4xl font-bold mt-3 text-white">
                {t(
                  "home.services.heading",
                  "Everything your healthcare team needs"
                )}
              </h2>

              <p className="mt-4 text-slate-200">
                {t(
                  "home.services.text",
                  "Manage essential hospital operations from a single connected platform."
                )}
              </p>

            </motion.div>


            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">

              {services.map((service, index) => (

                <motion.div
                  key={service.label}
                  initial={{
                    opacity: 0,
                    y: 25,
                  }}
                  whileInView={{
                    opacity: 1,
                    y: 0,
                  }}
                  viewport={{
                    once: true,
                  }}
                  transition={{
                    delay: index * 0.08,
                  }}
                  whileHover={{
                    y: -6,
                  }}
                  className="glass-dark-card"
                >

                  <div className="w-12 h-12 rounded-xl bg-white/10 text-brand-200 flex items-center justify-center mb-5">
                    <FiActivity size={22} />
                  </div>

                  <h3 className="font-bold text-lg text-white">
                    {t(service.labelKey, service.label)}
                  </h3>

                  <p className="text-sm text-slate-300 mt-2">
                    {t(service.textKey, service.text)}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      openProtectedPage(service.path)
                    }
                    className="inline-flex items-center gap-2 text-sm text-brand-200 font-semibold mt-5"
                  >
                    {t("home.services.learnMore", "Learn more")}
                    <FiArrowRight />
                  </button>

                </motion.div>

              ))}

            </div>

          </div>

        </section>

          </div>

        </div>
        {/* ---------- end of the video zone ----------

          FEATURES below is `bg-slate-950`, so the zone hands over to
          a dark section and the seam does not read as a jump.
        ---------------------------------------------- */}


        {/* ==================================================
            FEATURES
        ================================================== */}

        <section
          id="features"
          className="relative z-10 bg-slate-950 text-white py-24"
        >

          <div className="max-w-7xl mx-auto px-6">

            <div className="grid lg:grid-cols-2 gap-14 items-center">

              <motion.div
                initial={{
                  opacity: 0,
                  x: -25,
                }}
                whileInView={{
                  opacity: 1,
                  x: 0,
                }}
                viewport={{
                  once: true,
                }}
              >

                <span className="text-sm font-bold tracking-widest text-sky-400">
                  {t("home.platform.eyebrow", "PLATFORM FEATURES")}
                </span>

                <h2 className="text-4xl lg:text-5xl font-bold mt-3">
                  {t("home.platform.headingLine1", "One platform.")}

                  <span className="block text-sky-400">
                    {t("home.platform.headingLine2", "Complete control.")}
                  </span>
                </h2>

                <p className="mt-6 text-slate-400 leading-8">
                  {t(
                    "home.platform.text",
                    "Keep your healthcare operations organized with connected modules designed for modern hospital teams."
                  )}
                </p>

              </motion.div>


              <div className="grid sm:grid-cols-2 gap-4">

                {features.slice(0, 4).map((feature, index) => (

                  <motion.div
                    key={feature.key}
                    initial={{
                      opacity: 0,
                      y: 20,
                    }}
                    whileInView={{
                      opacity: 1,
                      y: 0,
                    }}
                    viewport={{
                      once: true,
                    }}
                    transition={{
                      delay: index * 0.08,
                    }}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                  >

                    <FiCheck
                      className="text-emerald-400 mb-4"
                      size={22}
                    />

                    <h3 className="font-semibold">
                      {t(feature.key, feature.text)}
                    </h3>

                  </motion.div>

                ))}

              </div>

            </div>

          </div>

        </section>


        {/* ==================================================
            CONTACT
        ================================================== */}

        <section
          id="contact"
          className="py-24 bg-white"
        >

          <div className="max-w-7xl mx-auto px-6">

            <motion.div
              initial={{
                opacity: 0,
                y: 20,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: true,
              }}
              className="glass-card"
            >

              <div className="grid lg:grid-cols-2 gap-10">

                <div>

                  <span className="text-sm font-bold tracking-widest text-brand-600">
                    {t("home.contact.eyebrow", "CONTACT")}
                  </span>

                  <h2 className="text-4xl font-bold mt-3">
                    {t(
                      "home.contact.heading",
                      "Let's improve healthcare together."
                    )}
                  </h2>

                  <p className="text-slate-500 mt-5 leading-7">
                    {t(
                      "home.contact.text",
                      "Have a question about HealthCare Pro? Get in touch with our team."
                    )}
                  </p>

                  <div className="mt-8 space-y-4">

                    <ContactItem
                      icon={FiMail}
                      text="support@healthcarepro.com"
                    />

                    <ContactItem
                      icon={FiPhone}
                      text="+91 98765 43210"
                    />

                    <ContactItem
                      icon={FiMapPin}
                      text={t("home.contact.location", "India")}
                    />

                  </div>

                </div>


                <form onSubmit={submitContact} className="space-y-4" noValidate>

                  <div>
                    <input
                      type="text"
                      placeholder={t("home.contact.namePlaceholder", "Your name")}
                      value={contactForm.name}
                      onChange={updateContact("name")}
                      required
                      className="input-field"
                    />
                    {contactErrors.name && (
                      <p className="text-xs text-red-600 mt-1.5">{contactErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <input
                      type="email"
                      placeholder={t("home.contact.emailPlaceholder", "Email address")}
                      value={contactForm.email}
                      onChange={updateContact("email")}
                      required
                      className="input-field"
                    />
                    {contactErrors.email && (
                      <p className="text-xs text-red-600 mt-1.5">{contactErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <textarea
                      placeholder={t("home.contact.messagePlaceholder", "Your message")}
                      rows="5"
                      value={contactForm.message}
                      onChange={updateContact("message")}
                      required
                      className="input-field resize-none"
                    />
                    {contactErrors.message && (
                      <p className="text-xs text-red-600 mt-1.5">{contactErrors.message}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={contactSending}
                    className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {contactSending
                      ? t("home.contact.sending", "Sending...")
                      : t("home.contact.send", "Send Message")}
                  </button>

                </form>

              </div>

            </motion.div>

          </div>

        </section>

      </main>


      {/* ==================================================
          FOOTER
      ================================================== */}

      <footer className="bg-slate-950 text-white">

        <div className="max-w-7xl mx-auto px-5 sm:px-6 py-10 sm:py-16">

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 sm:gap-10">

            {/* BRAND */}

            <div className="col-span-2 lg:col-span-1">

              <Link
                to="/"
                className="flex items-center gap-3"
              >

                <Logo className="w-11 h-11 shrink-0" />

                <div>

                  <h3 className="font-bold text-lg">
                    HealthCare Pro
                  </h3>

                  <p className="text-xs text-slate-400">
                    {t("home.brand.tagline", "Hospital Management")}
                  </p>

                </div>

              </Link>

              <p className="text-sm text-slate-400 leading-6 mt-4 max-w-xs">
                {t(
                  "home.footer.tagline",
                  "A modern healthcare management platform built to simplify hospital operations."
                )}
              </p>


              {/* SOCIAL MEDIA */}

              <div className="flex items-center gap-3 mt-5">

                {/* Facebook */}

                <Social
                  icon={FiFacebook}
                  url="https://www.facebook.com/"
                  label="Facebook"
                  className="
                    bg-[#1877F2]
                    border-[#1877F2]
                    text-white
                    hover:bg-[#166FE5]
                  "
                />


                {/* Instagram */}

                <Social
                  icon={FiInstagram}
                  url="https://www.instagram.com/"
                  label="Instagram"
                  className="
                    bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]
                    border-transparent
                    text-white
                  "
                />


                {/* Twitter */}

                <Social
                  icon={FiTwitter}
                  url="https://twitter.com/"
                  label="Twitter"
                  className="
                    bg-[#1DA1F2]
                    border-[#1DA1F2]
                    text-white
                    hover:bg-[#168FE0]
                  "
                />


                {/* LinkedIn */}

                <Social
                  icon={FiLinkedin}
                  url="https://www.linkedin.com/"
                  label="LinkedIn"
                  className="
                    bg-[#0A66C2]
                    border-[#0A66C2]
                    text-white
                    hover:bg-[#0959A8]
                  "
                />

              </div>

            </div>


            {/* COMPANY */}

            <div>

              <h3 className="font-semibold mb-3 sm:mb-5">
                {t("home.footer.company", "Company")}
              </h3>

              <div className="space-y-2.5 sm:space-y-3 text-sm text-slate-400">

                <Link
                  to="/"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.home", "Home")}
                </Link>

                <a
                  href="#about"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.about", "About")}
                </a>

                <a
                  href="#services"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.services", "Services")}
                </a>

                <a
                  href="#features"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.features", "Features")}
                </a>

                <a
                  href="#contact"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.contact", "Contact")}
                </a>

              </div>

            </div>


            {/* QUICK LINKS */}

            <div>

              <h3 className="font-semibold mb-3 sm:mb-5">
                {t("home.footer.quickLinks", "Quick Links")}
              </h3>

              <div className="space-y-2.5 sm:space-y-3 text-sm text-slate-400">

                <Link
                  to="/"
                  className="block hover:text-blue-400 transition-colors"
                >
                  {t("home.nav.home", "Home")}
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    openProtectedPage("/dashboard")
                  }
                  className="block text-left hover:text-blue-400 transition-colors"
                >
                  {t("nav.dashboard", "Dashboard")}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openProtectedPage("/patients")
                  }
                  className="block text-left hover:text-blue-400 transition-colors"
                >
                  {t("nav.patients", "Patients")}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openProtectedPage("/doctors")
                  }
                  className="block text-left hover:text-blue-400 transition-colors"
                >
                  {t("nav.doctors", "Doctors")}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openProtectedPage("/appointments")
                  }
                  className="block text-left hover:text-blue-400 transition-colors"
                >
                  {t("nav.appointments", "Appointments")}
                </button>

              </div>

            </div>


            {/* SERVICES */}

            <div>

              <h3 className="font-semibold mb-3 sm:mb-5">
                {t("home.nav.services", "Services")}
              </h3>

              <div className="space-y-2.5 sm:space-y-3 text-sm text-slate-400">

                {services.map((service) => (

                  <button
                    key={service.path}
                    type="button"
                    onClick={() =>
                      openProtectedPage(service.path)
                    }
                    className="block text-left hover:text-blue-400 transition-colors"
                  >
                    {t(service.labelKey, service.label)}
                  </button>

                ))}

              </div>

            </div>

          </div>


          {/* FOOTER BOTTOM */}

          <div className="border-t border-slate-800 mt-8 sm:mt-12 pt-5 sm:pt-6 flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 text-xs sm:text-sm text-slate-500">

            <p>
              © {new Date().getFullYear()} HealthCare Pro.{" "}
              {t("home.footer.rights", "All rights reserved.")}
            </p>

            <div className="flex items-center gap-5 sm:gap-6">

              <Link
                to="/privacy"
                className="hover:text-blue-400 transition-colors"
              >
                {t("home.footer.privacy", "Privacy Policy")}
              </Link>

              <Link
                to="/terms"
                className="hover:text-blue-400 transition-colors"
              >
                {t("home.footer.terms", "Terms & Conditions")}
              </Link>

            </div>

          </div>

        </div>

      </footer>

    </div>
  );
}


/* ==================================================
   STAT COMPONENT
================================================== */

function Stat({
  icon: Icon,
  number,
  label,
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="glass-dark-card flex items-center gap-4"
    >

      <div className="w-12 h-12 rounded-xl bg-white/10 text-brand-200 flex items-center justify-center">
        <Icon size={22} />
      </div>

      <div>

        <div className="text-xl font-bold text-white">
          {number}
        </div>

        <div className="text-xs text-slate-300">
          {label}
        </div>

      </div>

    </motion.div>
  );
}


/* ==================================================
   INFO CARD
================================================== */

/*
 * bg-white/5, not /10: this tile sits inside a panel that is
 * already white/10, and stacking the two lifted the backdrop enough
 * to pull the caption under 4.5:1.
 */
function InfoCard({
  icon: Icon,
  title,
  text,
}) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">

      <div className="w-10 h-10 rounded-xl bg-white/10 text-brand-200 flex items-center justify-center mb-4">
        <Icon size={20} />
      </div>

      <h3 className="font-semibold text-white">
        {title}
      </h3>

      <p className="text-sm text-slate-200 mt-1">
        {text}
      </p>

    </div>
  );
}


/* ==================================================
   CONTACT ITEM
================================================== */

function ContactItem({
  icon: Icon,
  text,
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600">

      <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
        <Icon size={18} />
      </div>

      {text}

    </div>
  );
}


/* ==================================================
   SOCIAL MEDIA
================================================== */

function Social({
  icon: Icon,
  url,
  label,
  className = "",
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`
        w-10
        h-10
        rounded-xl
        border
        flex
        items-center
        justify-center
        text-white
        shadow-sm
        transition-all
        duration-200
        hover:-translate-y-1
        hover:shadow-lg
        ${className}
      `}
    >
      <Icon
        size={18}
        strokeWidth={2}
      />
    </a>
  );
}