import bcrypt from "bcryptjs";

import db from "./db.js";
import { config } from "./config/env.js";
import { today, addDays } from "./utils/time.js";

/* ==================================================================
   SEEDING RULES

   1. The administrator is ensured on every boot (created if missing).
   2. Reference data (departments, doctors, availability) is inserted
      only when its table is empty.
   3. Demo operational data is inserted only when its table is empty.
   4. Normal user accounts are NEVER seeded — real accounts come from
      the signup form.

   Nothing here deletes or overwrites existing rows.
================================================================== */

const DEPARTMENTS = [
  ["Cardiology", "Heart and vascular care, diagnostics and interventions."],
  ["Neurology", "Brain, spine and nervous system diagnosis and treatment."],
  ["Orthopedics", "Bones, joints, ligaments and sports injury care."],
  ["Pediatrics", "Healthcare for infants, children and adolescents."],
  ["Gynecology", "Women's health, maternity and reproductive care."],
  ["Dermatology", "Skin, hair and nail conditions."],
  ["ENT", "Ear, nose, throat, head and neck care."],
  ["General Medicine", "Primary diagnosis, preventive care and follow-ups."],
];

const DOCTORS = [
  {
    name: "Dr. Meera Nair",
    email: "meera.nair@healthcarepro.io",
    phone: "+91 98200 11223",
    specialization: "Cardiology",
    department: "Cardiology",
    qualification: "MBBS, MD (Cardiology), DM",
    experience_years: 14,
    consultation_fee: 1200,
    rating: 4.8,
    availability: "Available",
    bio: "Interventional cardiologist focused on preventive heart care and angioplasty.",
  },
  {
    name: "Dr. Arjun Rao",
    email: "arjun.rao@healthcarepro.io",
    phone: "+91 98200 11224",
    specialization: "Orthopedics",
    department: "Orthopedics",
    qualification: "MBBS, MS (Orthopedics)",
    experience_years: 9,
    consultation_fee: 900,
    rating: 4.6,
    availability: "In Surgery",
    bio: "Joint replacement and sports injury specialist.",
  },
  {
    name: "Dr. Sana Iqbal",
    email: "sana.iqbal@healthcarepro.io",
    phone: "+91 98200 11225",
    specialization: "Pediatrics",
    department: "Pediatrics",
    qualification: "MBBS, MD (Paediatrics)",
    experience_years: 11,
    consultation_fee: 800,
    rating: 4.9,
    availability: "Available",
    bio: "Child health, immunisation and developmental assessment.",
  },
  {
    name: "Dr. Vikram Seth",
    email: "vikram.seth@healthcarepro.io",
    phone: "+91 98200 11226",
    specialization: "Neurology",
    department: "Neurology",
    qualification: "MBBS, MD, DM (Neurology)",
    experience_years: 17,
    consultation_fee: 1500,
    rating: 4.7,
    availability: "Available",
    bio: "Stroke, epilepsy and movement disorder management.",
  },
  {
    name: "Dr. Leela Menon",
    email: "leela.menon@healthcarepro.io",
    phone: "+91 98200 11227",
    specialization: "General Medicine",
    department: "General Medicine",
    qualification: "MBBS, MD (General Medicine)",
    experience_years: 8,
    consultation_fee: 600,
    rating: 4.5,
    availability: "Available",
    bio: "Primary care, chronic disease management and health check-ups.",
  },
  {
    name: "Dr. Farah Sheikh",
    email: "farah.sheikh@healthcarepro.io",
    phone: "+91 98200 11228",
    specialization: "Dermatology",
    department: "Dermatology",
    qualification: "MBBS, MD (Dermatology)",
    experience_years: 6,
    consultation_fee: 750,
    rating: 4.4,
    availability: "Available",
    bio: "Medical and cosmetic dermatology, allergy testing.",
  },
  {
    name: "Dr. Kabir Malhotra",
    email: "kabir.malhotra@healthcarepro.io",
    phone: "+91 98200 11229",
    specialization: "ENT",
    department: "ENT",
    qualification: "MBBS, MS (ENT)",
    experience_years: 12,
    consultation_fee: 850,
    rating: 4.6,
    availability: "Available",
    bio: "Sinus, hearing and voice disorder treatment.",
  },
  {
    name: "Dr. Ritu Bhalla",
    email: "ritu.bhalla@healthcarepro.io",
    phone: "+91 98200 11230",
    specialization: "Gynecology",
    department: "Gynecology",
    qualification: "MBBS, MS (Obstetrics & Gynaecology)",
    experience_years: 15,
    consultation_fee: 1000,
    rating: 4.8,
    availability: "Available",
    bio: "Maternity care, fertility support and women's wellness.",
  },
];

/* Monday–Saturday morning and evening clinics. */
const WORKING_WINDOWS = [
  { start_time: "09:00", end_time: "13:00" },
  { start_time: "16:00", end_time: "19:00" },
];

const PHARMACY = [
  ["Paracetamol 500mg", "Analgesic", 1200, 2.5, "MedLife Distributors", "2027-03-01"],
  ["Amoxicillin 250mg", "Antibiotic", 340, 6.0, "PharmaCare Ltd.", "2026-12-15"],
  ["Cetirizine 10mg", "Antihistamine", 800, 1.8, "MedLife Distributors", "2027-06-20"],
  ["Insulin Glargine", "Hormone", 60, 450, "BioGen Supplies", "2026-10-05"],
  ["Atorvastatin 20mg", "Statin", 25, 8.2, "PharmaCare Ltd.", "2026-09-10"],
  ["Metformin 500mg", "Antidiabetic", 640, 3.1, "BioGen Supplies", "2027-01-22"],
  ["Azithromycin 500mg", "Antibiotic", 180, 12.4, "PharmaCare Ltd.", "2026-11-30"],
  ["Salbutamol Inhaler", "Bronchodilator", 45, 210, "RespiCare", "2027-04-18"],
];

const PATIENTS = [
  {
    name: "Ravi Kulkarni",
    phone: "+91 90000 11111",
    date_of_birth: "1972-04-11",
    gender: "Male",
    blood_group: "B+",
    department: "Cardiology",
    doctor: "Dr. Meera Nair",
    room: "204-A",
    status: "Stable",
    admitted_at: "2026-08-01",
    history: ["Hypertension (2019)", "Angioplasty (2023)"],
  },
  {
    name: "Ayesha Khan",
    phone: "+91 90000 22222",
    date_of_birth: "2018-02-20",
    gender: "Female",
    blood_group: "O+",
    department: "Pediatrics",
    doctor: "Dr. Sana Iqbal",
    room: "112-B",
    status: "Recovering",
    admitted_at: "2026-07-30",
    history: ["Seasonal flu"],
  },
  {
    name: "Thomas George",
    phone: "+91 90000 33333",
    date_of_birth: "1959-09-02",
    gender: "Male",
    blood_group: "A+",
    department: "Orthopedics",
    doctor: "Dr. Arjun Rao",
    room: "301-C",
    status: "Critical",
    admitted_at: "2026-08-02",
    history: ["Hip fracture", "Diabetes Type 2"],
  },
  {
    name: "Priya Sharma",
    phone: "+91 90000 44444",
    date_of_birth: "1992-06-14",
    gender: "Female",
    blood_group: "AB+",
    department: "Neurology",
    doctor: "Dr. Vikram Seth",
    room: "205-A",
    status: "Stable",
    admitted_at: "2026-07-28",
    history: ["Migraine"],
  },
  {
    name: "Manoj Pillai",
    phone: "+91 90000 55555",
    date_of_birth: "1981-11-07",
    gender: "Male",
    blood_group: "O-",
    department: "General Medicine",
    doctor: "Dr. Leela Menon",
    room: "108-B",
    status: "Recovering",
    admitted_at: "2026-07-31",
    history: ["Typhoid"],
  },
  {
    name: "Fatima Sheikh",
    phone: "+91 90000 66666",
    date_of_birth: "1997-03-25",
    gender: "Female",
    blood_group: "B-",
    department: "Cardiology",
    doctor: "Dr. Meera Nair",
    room: "206-A",
    status: "Stable",
    admitted_at: "2026-08-03",
    history: ["Arrhythmia"],
  },
];

const LAB_TESTS = [
  ["Ravi Kulkarni", "Lipid Profile (Blood Test)", "Biochemistry", 850, "2026-08-01", "Completed", "Available"],
  ["Thomas George", "X-Ray — Hip", "Radiology", 1200, "2026-08-02", "Completed", "Available"],
  ["Priya Sharma", "MRI — Brain", "Radiology", 7500, "2026-08-03", "In Progress", "Pending"],
  ["Fatima Sheikh", "CT Scan — Chest", "Radiology", 4200, "2026-08-04", "Scheduled", "Pending"],
  ["Manoj Pillai", "CBC (Blood Test)", "Haematology", 450, "2026-07-31", "Completed", "Available"],
];

const BILLING = [
  ["INV-1042", "Ravi Kulkarni", 12500, 625, 500, "Star Health", "Paid", "2026-08-01"],
  ["INV-1043", "Ayesha Khan", 3200, 160, 0, "None", "Paid", "2026-07-30"],
  ["INV-1044", "Thomas George", 48500, 2425, 2000, "ICICI Lombard", "Pending", "2026-08-02"],
  ["INV-1045", "Priya Sharma", 9800, 490, 300, "None", "Pending", "2026-07-28"],
  ["INV-1046", "Manoj Pillai", 7400, 370, 0, "Star Health", "Paid", "2026-07-31"],
];

const EMERGENCY = [
  ["Unknown — RTA Case", null, "Road traffic accident, multiple trauma", "Critical", "Active", "08:12"],
  ["Sunil Yadav", "+91 90000 77777", "Severe chest pain", "Serious", "Admitted", "08:40"],
  ["Neha Joshi", "+91 90000 88888", "Allergic reaction", "Stable", "Active", "09:05"],
];

const RESOURCES = [
  ["ambulance", "AMB-01", "Available", "Bay 1"],
  ["ambulance", "AMB-02", "On Call", "En route"],
  ["ambulance", "AMB-03", "Available", "Bay 3"],
  ["ambulance", "AMB-04", "Maintenance", "Garage"],
  ["icu", "total", "20", null],
  ["icu", "occupied", "15", null],
  ["blood", "A+", "24", null],
  ["blood", "B+", "18", null],
  ["blood", "O+", "30", null],
  ["blood", "AB+", "9", null],
  ["blood", "O-", "6", null],
  ["blood", "A-", "11", null],
];

/* ================================================================ */

const countOf = (table) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

function ensureAdmin() {
  /*
   * A lockout guard, not a standing override.
   *
   * This used to force the ADMIN_EMAIL account back to admin/active on
   * every boot, which meant deactivating a compromised or departed
   * administrator was silently undone by the next restart — with no
   * audit trail. While SOMEBODY can still administer the hospital,
   * leave the accounts exactly as the administrators left them.
   */
  const activeAdmins = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`
    )
    .get().n;

  if (activeAdmins > 0) return;

  const existing = db
    .prepare(`SELECT id, role, status FROM users WHERE email = ?`)
    .get(config.adminEmail);

  if (existing) {
    /* Reached only with no active administrator left: restore the
       .env account so the hospital can never be locked out. */
    db.prepare(
      `UPDATE users SET role = 'admin', status = 'active',
                        updated_at = datetime('now')
       WHERE id = ?`
    ).run(existing.id);

    console.log(
      `[seed] no active administrator remained — restored ${config.adminEmail}`
    );
    return;
  }

  const hash = bcrypt.hashSync(config.adminPassword, config.bcryptRounds);

  db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`
  ).run(config.adminName, config.adminEmail, "+91 90210 23697", hash);

  console.log(`[seed] administrator created: ${config.adminEmail}`);
}

function seedDepartments() {
  if (countOf("departments") > 0) return;

  const insert = db.prepare(
    `INSERT INTO departments (name, description) VALUES (?, ?)`
  );

  db.transaction(() => {
    for (const [name, description] of DEPARTMENTS) insert.run(name, description);
  })();

  console.log(`[seed] ${DEPARTMENTS.length} departments created`);
}

function seedDoctors() {
  if (countOf("doctors") > 0) return;

  const departmentId = db.prepare(`SELECT id FROM departments WHERE name = ?`);

  const insertDoctor = db.prepare(`
    INSERT INTO doctors
      (name, email, phone, specialization, department_id, qualification,
       experience_years, consultation_fee, bio, availability, rating, slot_minutes)
    VALUES
      (@name, @email, @phone, @specialization, @department_id, @qualification,
       @experience_years, @consultation_fee, @bio, @availability, @rating, 30)
  `);

  const insertWindow = db.prepare(`
    INSERT OR IGNORE INTO doctor_availability
      (doctor_id, weekday, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const doctor of DOCTORS) {
      const dept = departmentId.get(doctor.department);

      const result = insertDoctor.run({
        ...doctor,
        department_id: dept?.id ?? null,
      });

      /* Monday (1) through Saturday (6). */
      for (let weekday = 1; weekday <= 6; weekday += 1) {
        for (const window of WORKING_WINDOWS) {
          insertWindow.run(
            result.lastInsertRowid,
            weekday,
            window.start_time,
            window.end_time
          );
        }
      }
    }
  })();

  console.log(`[seed] ${DOCTORS.length} doctors + availability created`);
}

/*
 * Doctor login accounts.
 *
 * Doctors used to be a pure catalog table with no login of their own.
 * Real-time chat needs an authenticated doctor-side participant, so
 * every catalog row that is not yet linked to a `users` account gets
 * one here — this runs on every boot (not just an empty table) so it
 * also repairs a database that already had doctors before this
 * feature existed.
 */
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || "doctor123";

function seedDoctorAccounts() {
  const unlinked = db.prepare(`SELECT * FROM doctors WHERE user_id IS NULL`).all();
  if (unlinked.length === 0) return;

  const passwordHash = bcrypt.hashSync(DOCTOR_PASSWORD, config.bcryptRounds);
  const findUserByEmail = db.prepare(`SELECT id, role FROM users WHERE email = ?`);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, status)
    VALUES (?, ?, ?, ?, 'doctor', 'active')
  `);

  const linkDoctor = db.prepare(`UPDATE doctors SET user_id = ? WHERE id = ?`);

  db.transaction(() => {
    for (const doctor of unlinked) {
      let account = findUserByEmail.get(doctor.email);

      if (!account) {
        const result = insertUser.run(doctor.name, doctor.email, doctor.phone, passwordHash);
        account = { id: result.lastInsertRowid };
      }

      linkDoctor.run(account.id, doctor.id);
    }
  })();

  /* The password is deliberately NOT logged. Console output ends up in
     container logs, journals and hosted aggregators that far more
     people can read than should hold a working clinician credential
     with full access to patient records. */
  console.log(`[seed] ${unlinked.length} doctor login account(s) linked`);
}

function seedPatients() {
  if (countOf("patients") > 0) return;

  const deptId = db.prepare(`SELECT id FROM departments WHERE name = ?`);
  const docId = db.prepare(`SELECT id FROM doctors WHERE name = ?`);

  const insert = db.prepare(`
    INSERT INTO patients
      (name, phone, date_of_birth, gender, blood_group, department_id,
       doctor_id, room, status, admitted_at, medical_history)
    VALUES
      (@name, @phone, @date_of_birth, @gender, @blood_group, @department_id,
       @doctor_id, @room, @status, @admitted_at, @medical_history)
  `);

  db.transaction(() => {
    for (const patient of PATIENTS) {
      insert.run({
        name: patient.name,
        phone: patient.phone,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        blood_group: patient.blood_group,
        department_id: deptId.get(patient.department)?.id ?? null,
        doctor_id: docId.get(patient.doctor)?.id ?? null,
        room: patient.room,
        status: patient.status,
        admitted_at: patient.admitted_at,
        medical_history: JSON.stringify(patient.history),
      });
    }
  })();

  console.log(`[seed] ${PATIENTS.length} patient records created`);
}

function seedPharmacy() {
  if (countOf("pharmacy_items") > 0) return;

  const insert = db.prepare(`
    INSERT INTO pharmacy_items
      (name, category, stock, unit_price, supplier, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of PHARMACY) insert.run(...row);
  })();

  console.log(`[seed] ${PHARMACY.length} pharmacy items created`);
}

function seedLaboratory() {
  if (countOf("laboratory_tests") > 0) return;

  const patientId = db.prepare(`SELECT id FROM patients WHERE name = ?`);

  const insert = db.prepare(`
    INSERT INTO laboratory_tests
      (patient_id, patient_name, test_name, category, price, test_date, status, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const [name, test, category, price, date, status, result] of LAB_TESTS) {
      insert.run(
        patientId.get(name)?.id ?? null,
        name,
        test,
        category,
        price,
        date,
        status,
        result
      );
    }
  })();

  console.log(`[seed] ${LAB_TESTS.length} laboratory tests created`);
}

function seedBilling() {
  if (countOf("billing_records") > 0) return;

  const patientId = db.prepare(`SELECT id FROM patients WHERE name = ?`);

  const insert = db.prepare(`
    INSERT INTO billing_records
      (invoice_no, patient_id, patient_name, amount, tax, discount,
       total, insurance, status, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const [inv, name, amount, tax, discount, insurance, status, date] of BILLING) {
      insert.run(
        inv,
        patientId.get(name)?.id ?? null,
        name,
        amount,
        tax,
        discount,
        amount + tax - discount,
        insurance,
        status,
        date
      );
    }
  })();

  console.log(`[seed] ${BILLING.length} billing records created`);
}

function seedEmergency() {
  if (countOf("emergency_cases") > 0) return;

  const insert = db.prepare(`
    INSERT INTO emergency_cases
      (patient_name, phone, condition, severity, status, arrived_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of EMERGENCY) insert.run(...row);
  })();

  console.log(`[seed] ${EMERGENCY.length} emergency cases created`);
}

function seedResources() {
  if (countOf("hospital_resources") > 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO hospital_resources (kind, label, value, meta)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of RESOURCES) insert.run(...row);
  })();

  console.log("[seed] hospital resources created");
}

/*
 * A handful of historical appointments so the admin analytics have
 * something real to chart on a brand new database. These belong to
 * the seeded patients, not to any user account.
 */
function seedHistoricalAppointments() {
  if (countOf("appointments") > 0) return;

  const admin = db
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .get(config.adminEmail);

  if (!admin) return;

  const doctors = db.prepare(`SELECT id, department_id FROM doctors`).all();
  const patients = db.prepare(`SELECT id, name FROM patients`).all();

  if (doctors.length === 0 || patients.length === 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO appointments
      (user_id, patient_id, doctor_id, department_id, appointment_date,
       appointment_time, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "16:00", "16:30"];
  const reasons = [
    "Routine follow-up",
    "Consultation",
    "Post-surgery review",
    "Scan review",
    "General health check",
  ];

  db.transaction(() => {
    let n = 0;

    for (let dayOffset = -12; dayOffset <= 6; dayOffset += 1) {
      const date = addDays(today(), dayOffset);
      const perDay = 2 + (Math.abs(dayOffset) % 3);

      for (let i = 0; i < perDay; i += 1) {
        const doctor = doctors[n % doctors.length];
        const patient = patients[n % patients.length];
        const slot = slots[(n + dayOffset) % slots.length];

        const status =
          dayOffset < 0
            ? n % 7 === 0
              ? "cancelled"
              : "completed"
            : dayOffset === 0
            ? "confirmed"
            : "scheduled";

        insert.run(
          admin.id,
          patient.id,
          doctor.id,
          doctor.department_id,
          date,
          slot,
          reasons[n % reasons.length],
          status
        );

        n += 1;
      }
    }
  })();

  console.log("[seed] historical appointments created for analytics");
}

export function runSeed() {
  ensureAdmin();
  seedDepartments();
  seedDoctors();
  seedDoctorAccounts();
  seedPatients();
  seedPharmacy();
  seedLaboratory();
  seedBilling();
  seedEmergency();
  seedResources();
  seedHistoricalAppointments();
}

export default runSeed;
