import crypto from "node:crypto";

import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";
import { notify } from "../utils/notify.js";

/* ==================================================================
   TELECONSULTATION (Jitsi Meet)

   Jitsi needs no account and no API: a room is created the first time
   somebody joins one by that name. All this service does is mint a
   room name, remember it on the appointment so both sides land in the
   same place across reloads, and decide who is allowed in.

   The name is random rather than derived from the appointment id.
   `healthcare-pro-42` would be guessable by anyone who can count, and
   a public Jitsi room is open to whoever knows its name.
================================================================== */

const findAppointment = db.prepare(`
  SELECT
    a.id, a.user_id AS userId, a.doctor_id AS doctorId, a.status,
    a.appointment_date AS date, a.appointment_time AS time,
    a.mode, a.video_room AS videoRoom,
    d.user_id AS doctorUserId, d.name AS doctorName,
    u.name AS patientName
  FROM appointments a
  LEFT JOIN doctors d ON d.id = a.doctor_id
  LEFT JOIN users u   ON u.id = a.user_id
  WHERE a.id = ?
`);

const setRoom = db.prepare(
  `UPDATE appointments
      SET video_room = ?, mode = 'video', updated_at = datetime('now')
    WHERE id = ?`
);

/* Switching back to in-person clears the room along with the mode —
   leaving a stale video_room behind would let a stale Jitsi link
   resurface if the appointment ever went back to video. */
const setModeInPerson = db.prepare(
  `UPDATE appointments SET mode = 'in_person', video_room = NULL, updated_at = datetime('now') WHERE id = ?`
);

/** Statuses where a call still makes sense. */
const JOINABLE = ["pending", "confirmed", "scheduled", "rescheduled"];

function generateRoomName() {
  return `hcpro-${crypto.randomBytes(9).toString("hex")}`;
}

/**
 * Who may act on this appointment's call.
 *
 * The patient who booked it, the doctor it is with, and admins. A
 * doctor is matched through doctors.user_id, never through an id the
 * client supplied.
 */
function assertParticipant(appointment, user) {
  if (user.role === "admin") return "admin";

  if (Number(appointment.userId) === Number(user.id)) return "patient";

  if (appointment.doctorUserId && Number(appointment.doctorUserId) === Number(user.id)) {
    return "doctor";
  }

  throw ApiError.forbidden("This consultation is not yours to join.");
}

export function getAppointmentOrThrow(id) {
  const appointment = findAppointment.get(Number(id));
  if (!appointment) throw ApiError.notFound("Appointment not found.");
  return appointment;
}

/**
 * Switch an appointment between in-person and video.
 *
 * Turning video on mints the room immediately so the link is ready
 * before anyone tries to join.
 */
export function setAppointmentMode(id, mode, user) {
  const appointment = getAppointmentOrThrow(id);
  const role = assertParticipant(appointment, user);

  /* Patients ask for a video visit; whether it happens is the
     hospital's call, so only staff can flip the switch. */
  if (role === "patient") {
    throw ApiError.forbidden(
      "Ask the hospital to change this appointment to a video consultation."
    );
  }

  if (mode === "video") {
    const room = appointment.videoRoom || generateRoomName();
    setRoom.run(room, appointment.id);

    notify(appointment.userId, {
      title: "Your appointment is now a video consultation",
      message: `${appointment.doctorName || "Your doctor"} — ${appointment.date} ${appointment.time}`,
      type: "info",
      link: "/my-appointments",
    });

    return { ...getAppointmentOrThrow(id), joinUrl: joinUrlFor(room) };
  }

  setModeInPerson.run(appointment.id);
  return getAppointmentOrThrow(id);
}

function joinUrlFor(room) {
  return `https://${config.jitsiDomain}/${room}`;
}

/**
 * Everything the client needs to open the call.
 *
 * The room is created on first request so an appointment that was
 * marked video before this feature existed still works.
 */
export function getJoinInfo(id, user) {
  const appointment = getAppointmentOrThrow(id);
  const role = assertParticipant(appointment, user);

  if (!JOINABLE.includes(appointment.status)) {
    throw ApiError.badRequest(
      `This appointment is ${appointment.status} — there is no call to join.`
    );
  }

  let room = appointment.videoRoom;

  if (!room) {
    if (role === "patient") {
      throw ApiError.badRequest("This is not a video consultation.");
    }

    room = generateRoomName();
    setRoom.run(room, appointment.id);
  }

  return {
    appointmentId: appointment.id,
    room,
    domain: config.jitsiDomain,
    joinUrl: joinUrlFor(room),
    role,
    /* Jitsi shows this above the participant's tile. */
    displayName: role === "doctor" ? appointment.doctorName : appointment.patientName,
    doctorName: appointment.doctorName,
    patientName: appointment.patientName,
    date: appointment.date,
    time: appointment.time,
  };
}

export default { getJoinInfo, setAppointmentMode, getAppointmentOrThrow };
