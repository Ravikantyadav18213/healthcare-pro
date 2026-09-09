import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";

import Layout from "./components/Layout.jsx";
import AuthTransition from "./components/AuthTransition.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { PageLoader } from "./components/ui/States.jsx";

import { useAuth } from "./hooks/useAuth.js";
import { homePathFor } from "./constants/roles.js";

/* Eager: the first screens a visitor sees. */
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

/* Lazy: everything behind authentication, so the landing page and
   sign-in flow stay fast. */
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const AccessDenied = lazy(() => import("./pages/AccessDenied.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const Patients = lazy(() => import("./pages/Patients.jsx"));
const Doctors = lazy(() => import("./pages/Doctors.jsx"));
const Appointments = lazy(() => import("./pages/Appointments.jsx"));
const Departments = lazy(() => import("./pages/Departments.jsx"));
const Staff = lazy(() => import("./pages/Staff.jsx"));
const Pharmacy = lazy(() => import("./pages/Pharmacy.jsx"));
const Laboratory = lazy(() => import("./pages/Laboratory.jsx"));
const Billing = lazy(() => import("./pages/Billing.jsx"));
const Emergency = lazy(() => import("./pages/Emergency.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Wards = lazy(() => import("./pages/Wards.jsx"));
const MedicalTimeline = lazy(() => import("./pages/MedicalTimeline.jsx"));
const DischargeSummaries = lazy(() => import("./pages/DischargeSummaries.jsx"));

const UserDashboard = lazy(() => import("./pages/UserDashboard.jsx"));
const UserReports = lazy(() => import("./pages/UserReports.jsx"));
const MyAppointments = lazy(() => import("./pages/MyAppointments.jsx"));
const BookAppointment = lazy(() => import("./pages/BookAppointment.jsx"));
const FindDoctors = lazy(() => import("./pages/FindDoctors.jsx"));

const Chat = lazy(() => import("./pages/Chat.jsx"));
const DoctorMessages = lazy(() => import("./pages/DoctorMessages.jsx"));
const DoctorDashboard = lazy(() => import("./pages/DoctorDashboard.jsx"));
const AdminChatRequests = lazy(() => import("./pages/AdminChatRequests.jsx"));

const DoctorAppointments = lazy(() => import("./pages/DoctorAppointments.jsx"));
const DoctorPatients = lazy(() => import("./pages/DoctorPatients.jsx"));
const DoctorPatientDetails = lazy(() => import("./pages/DoctorPatientDetails.jsx"));
const DoctorReports = lazy(() => import("./pages/DoctorReports.jsx"));
const DoctorPrescriptions = lazy(() => import("./pages/DoctorPrescriptions.jsx"));
const DoctorProfile = lazy(() => import("./pages/DoctorProfile.jsx"));

/* ==================================================================
    /dashboard is shared, but each role sees a different screen:
    admin  -> hospital operations dashboard
    doctor -> approved-conversations summary
    user   -> personal patient portal
================================================================== */

function RoleDashboard() {
  const { isAdmin, isDoctor, isPatient } = useAuth();
  if (isAdmin) return <Dashboard />;
  /* A doctor has their own dedicated route; /dashboard is not their home. */
  if (isDoctor) return <Navigate to="/doctor/dashboard" replace />;
  if (isPatient) return <UserDashboard />;
  /* An account whose role is none of the three above gets no portal —
     never a default one. */
  return <Navigate to="/access-denied" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          {/* Inside AuthProvider: the chosen language is read from the
              signed-in account, so this needs the session to exist. */}
          <LanguageProvider>
          <Suspense fallback={<PageLoader label="Loading..." />}>
            <Routes>

              {/* ==============================
                  PUBLIC
              ============================== */}

              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              {/* Sign in and sign up hand over with a page turn, so they
                  share a layout route that owns the animation. */}
              <Route element={<AuthTransition />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>
              {/* Recovery is a separate flow, not part of the sign in /
                  sign up flip. */}
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />


              {/* ==============================
                  AUTHENTICATED APPLICATION
              ============================== */}

              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >

                {/* ---------- shared ----------
                    /dashboard still branches by role internally
                    (RoleDashboard), but is now ALSO wrapped in the
                    same guard mechanism every other route uses, via
                    the explicit roles list — so a future audit of
                    ProtectedRoute usage does not miss it. */}

                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute roles={["admin", "doctor", "user"]}>
                      <RoleDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/profile" element={<Profile />} />

                {/* ---------- clinical records ---------- */}

                {/* The ward board is worked by nurses and read by the
                    front desk; only admin/nurse can move beds, which
                    the API enforces separately. */}
                <Route
                  path="/wards"
                  element={
                    <ProtectedRoute roles={["admin", "nurse", "receptionist", "doctor"]}>
                      <Wards />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/discharge-summaries"
                  element={
                    <ProtectedRoute roles={["admin", "doctor", "nurse", "receptionist"]}>
                      <DischargeSummaries />
                    </ProtectedRoute>
                  }
                />

                {/* A patient's own record needs no id in the URL. */}
                <Route
                  path="/my-health"
                  element={
                    <ProtectedRoute userOnly>
                      <MedicalTimeline />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/patients/:patientId/timeline"
                  element={
                    <ProtectedRoute roles={["admin", "doctor", "nurse", "receptionist"]}>
                      <MedicalTimeline />
                    </ProtectedRoute>
                  }
                />


                {/* ---------- patient portal ---------- */}

                <Route
                  path="/book-appointment"
                  element={
                    <ProtectedRoute userOnly>
                      <BookAppointment />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/my-appointments"
                  element={
                    <ProtectedRoute userOnly>
                      <MyAppointments />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/my-reports"
                  element={
                    <ProtectedRoute userOnly>
                      <UserReports />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/find-doctors"
                  element={
                    <ProtectedRoute userOnly>
                      <FindDoctors />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/messages"
                  element={
                    <ProtectedRoute userOnly>
                      <Chat />
                    </ProtectedRoute>
                  }
                />


                {/* ---------- doctor portal ---------- */}

                <Route
                  path="/doctor/dashboard"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/appointments"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorAppointments />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/patients"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorPatients />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/patients/:id"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorPatientDetails />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/reports"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorReports />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/prescriptions"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorPrescriptions />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/messages"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorMessages />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/doctor/profile"
                  element={
                    <ProtectedRoute doctorOnly>
                      <DoctorProfile />
                    </ProtectedRoute>
                  }
                />


                {/* ---------- administration ---------- */}

                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute adminOnly>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                {/* Nurses and receptionists both work with patients day to
                    day — the sidebar has always sent them here, but the
                    route itself was admin-only, so both roles hit a wall
                    on the very first click. */}
                <Route
                  path="/patients"
                  element={
                    <ProtectedRoute roles={["admin", "nurse", "receptionist"]}>
                      <Patients />
                    </ProtectedRoute>
                  }
                />

                {/* A receptionist looks up which doctor is free before
                    booking a slot. */}
                <Route
                  path="/doctors"
                  element={
                    <ProtectedRoute roles={["admin", "receptionist"]}>
                      <Doctors />
                    </ProtectedRoute>
                  }
                />

                {/* Front-desk work for both roles. */}
                <Route
                  path="/appointments"
                  element={
                    <ProtectedRoute roles={["admin", "nurse", "receptionist"]}>
                      <Appointments />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/departments"
                  element={
                    <ProtectedRoute adminOnly>
                      <Departments />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/staff"
                  element={
                    <ProtectedRoute adminOnly>
                      <Staff />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/pharmacy"
                  element={
                    <ProtectedRoute adminOnly>
                      <Pharmacy />
                    </ProtectedRoute>
                  }
                />

                {/* Nurses log and read lab results as part of ward care. */}
                <Route
                  path="/laboratory"
                  element={
                    <ProtectedRoute roles={["admin", "nurse"]}>
                      <Laboratory />
                    </ProtectedRoute>
                  }
                />

                {/* Billing is front-desk work. */}
                <Route
                  path="/billing"
                  element={
                    <ProtectedRoute roles={["admin", "receptionist"]}>
                      <Billing />
                    </ProtectedRoute>
                  }
                />

                {/* Triage is a nursing responsibility. */}
                <Route
                  path="/emergency"
                  element={
                    <ProtectedRoute roles={["admin", "nurse"]}>
                      <Emergency />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute adminOnly>
                      <Reports />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin/messages"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminChatRequests />
                    </ProtectedRoute>
                  }
                />

              </Route>


              {/* ==============================
                  ACCESS DENIED / 404
              ============================== */}

              {/* Reached by ProtectedRoute when a signed-in account's
                  role does not open the requested page. Public route
                  so redirecting here can never itself bounce again. */}
              <Route path="/access-denied" element={<AccessDenied />} />

              <Route path="*" element={<NotFound />} />

            </Routes>
          </Suspense>
          </LanguageProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
