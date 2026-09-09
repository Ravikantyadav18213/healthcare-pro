/* ==================================================================
   Shapers that guarantee sensitive columns never leave the server.
================================================================== */

/** Public representation of a user row. Never includes password_hash. */
export function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    role: row.role,
    status: row.status,
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || null,
    lastLogin: row.last_login || null,
    loginCount: row.login_count ?? 0,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    language: row.language || "en",
    createdAt: row.created_at,
  };
}

/** Adds admin-only operational fields, still without any secret. */
export function adminUser(row) {
  if (!row) return null;

  return {
    ...publicUser(row),
    failedLoginAttempts: row.failed_login_attempts ?? 0,
    appointmentCount: row.appointment_count ?? undefined,
    reportCount: row.report_count ?? undefined,
  };
}

export function publicDoctor(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    specialization: row.specialization,
    departmentId: row.department_id || null,
    department: row.department_name || null,
    qualification: row.qualification || null,
    experienceYears: row.experience_years ?? 0,
    consultationFee: row.consultation_fee ?? 0,
    bio: row.bio || null,
    profileImage: row.profile_image || null,
    availability: row.availability,
    rating: row.rating ?? 4.5,
    slotMinutes: row.slot_minutes ?? 30,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function publicAppointment(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    patientId: row.patient_id || null,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name || null,
    doctorSpecialization: row.doctor_specialization || null,
    departmentId: row.department_id || null,
    department: row.department_name || null,
    patientName: row.patient_display_name || null,
    patientEmail: row.patient_email || null,
    date: row.appointment_date,
    time: row.appointment_time,
    reason: row.reason || null,
    notes: row.notes || null,
    status: row.status,
    mode: row.mode || "in_person",
    videoRoom: row.video_room || null,
    consultationFee: row.consultation_fee ?? null,
    decisionNote: row.decision_note || null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicReport(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    patientId: row.patient_id || null,
    title: row.title,
    type: row.type,
    description: row.description || null,
    result: row.result || null,
    status: row.status,
    reportDate: row.report_date,
    fileName: row.file_name || null,
    mimeType: row.mime_type || null,
    fileSize: row.file_size || null,
    hasFile: Boolean(row.file_path),
    patientName: row.patient_display_name || null,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
    createdAt: row.created_at,
  };
}

export function publicPatient(row) {
  if (!row) return null;

  let history = [];
  try {
    history = JSON.parse(row.medical_history || "[]");
  } catch {
    history = [];
  }

  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    phone: row.phone || null,
    email: row.email || null,
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || null,
    bloodGroup: row.blood_group || null,
    address: row.address || null,
    emergencyContact: row.emergency_contact || null,
    departmentId: row.department_id || null,
    department: row.department_name || null,
    doctorId: row.doctor_id || null,
    doctor: row.doctor_name || null,
    room: row.room || null,
    status: row.status,
    admittedAt: row.admitted_at || null,
    age: row.date_of_birth ? ageFrom(row.date_of_birth) : null,
    medicalHistory: history,
    createdAt: row.created_at,
  };
}

export function publicNotification(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    link: row.link || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

/* ==================================================================
   CHAT
================================================================== */

export function publicConversation(row, viewerId = null) {
  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    patientId: row.patient_id,
    patientName: row.patient_name || null,
    patientEmail: row.patient_email || null,
    doctorId: row.doctor_id || null,
    doctorName: row.doctor_name || null,
    doctorSpecialization: row.doctor_specialization || null,
    doctorCatalogId: row.doctor_catalog_id || null,
    adminId: row.admin_id || null,
    approvalRequestId: row.approval_request_id || null,
    lastMessage: row.last_message || null,
    lastMessageAt: row.last_message_at || null,
    lastMessageType: row.last_message_type || null,
    lastMessageSenderId: row.last_message_sender_id ?? null,
    lastMessageRead: row.last_message_is_read === null ||
      row.last_message_is_read === undefined
        ? null
        : Boolean(row.last_message_is_read),
    unreadCount: row.unread_count ?? 0,
    online: row.online ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: viewerId ? Number(row.patient_id) === Number(viewerId) : undefined,
  };
}

export function publicChatMessage(row) {
  if (!row) return null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    senderName: row.sender_name || null,
    message: row.message,
    messageType: row.message_type,
    attachmentUrl: row.attachment_url || null,
    attachmentName: row.attachment_name || null,
    attachmentMime: row.attachment_mime || null,
    attachmentSize: row.attachment_size ?? null,
    attachmentDuration: row.attachment_duration ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicChatRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name || null,
    patientEmail: row.patient_email || null,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name || null,
    doctorSpecialization: row.doctor_specialization || null,
    conversationId: row.conversation_id || null,
    reason: row.reason,
    appointmentId: row.appointment_id || null,
    initialMessage: row.initial_message || null,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    reviewedByName: row.reviewed_by_name || null,
    rejectionReason: row.rejection_reason || null,
  };
}

/* ==================================================================
   DOCTOR PORTAL
================================================================== */

export function publicMedicalHistoryEntry(row) {
  if (!row) return null;

  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name || null,
    appointmentId: row.appointment_id || null,
    diagnosis: row.diagnosis || null,
    symptoms: row.symptoms || null,
    treatment: row.treatment || null,
    notes: row.notes || null,
    followUpDate: row.follow_up_date || null,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  };
}

export function publicPrescription(row) {
  if (!row) return null;

  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name || null,
    medicine: row.medicine,
    dosage: row.dosage || null,
    frequency: row.frequency || null,
    duration: row.duration || null,
    instructions: row.instructions || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ageFrom(dateOfBirth) {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age;
}
