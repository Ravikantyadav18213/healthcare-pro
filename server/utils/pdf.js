import PDFDocument from "pdfkit";

/* ==================================================================
   PDF DOCUMENTS

   Every document the hospital hands a patient — prescription,
   discharge summary, report — shares one letterhead and one set of
   section/field primitives, so they read as documents from the same
   hospital rather than three unrelated templates.

   Each builder streams into the response the caller passes in;
   nothing is buffered to disk.
================================================================== */

const BRAND = "#1d4ed8";
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";

const MARGIN = 48;

function formatDate(value, { withTime = false } = {}) {
  if (!value) return "—";

  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  );

  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function age(dateOfBirth) {
  if (!dateOfBirth) return null;

  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }

  return years >= 0 && years < 150 ? years : null;
}

function letterhead(doc, { title, subtitle }) {
  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("HealthCare Pro", MARGIN, MARGIN);

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text("Smart Hospital Management System", { continued: false });

  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(title, MARGIN, MARGIN + 44);

  if (subtitle) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(subtitle);
  }

  const y = doc.y + 8;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor(RULE).stroke();
  doc.y = y + 14;
}

/** Two-column key/value block — the patient header on every document. */
function fieldGrid(doc, pairs) {
  const usable = doc.page.width - MARGIN * 2;
  const colWidth = usable / 2;
  const startY = doc.y;
  let leftY = startY;
  let rightY = startY;

  pairs.forEach(([label, value], index) => {
    const left = index % 2 === 0;
    const x = MARGIN + (left ? 0 : colWidth);
    const y = left ? leftY : rightY;

    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, y, {
      width: colWidth - 12,
    });

    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(value == null || value === "" ? "—" : String(value), x, doc.y, {
        width: colWidth - 12,
      });

    const next = doc.y + 8;
    if (left) leftY = next;
    else rightY = next;
  });

  doc.y = Math.max(leftY, rightY);
}

function sectionHeading(doc, text) {
  if (doc.y > doc.page.height - 140) doc.addPage();

  doc.moveDown(0.4);
  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(text, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 });

  const y = doc.y + 3;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor(RULE).stroke();
  doc.y = y + 8;
}

function paragraph(doc, text, { placeholder = "—" } = {}) {
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(10)
    .text(text && String(text).trim() ? String(text) : placeholder, MARGIN, doc.y, {
      width: doc.page.width - MARGIN * 2,
      lineGap: 3,
    });

  doc.moveDown(0.5);
}

/**
 * Footer on every page.
 *
 * Written after all content so the page count is known — pdfkit
 * cannot number pages that do not exist yet.
 */
function footer(doc, note) {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    /* The footer deliberately sits below the text area. pdfkit adds a
       fresh page the moment anything crosses the bottom margin, so
       the margin is dropped for the duration of the write — without
       this, stamping a footer on page 1 creates page 2, which then
       needs its own footer, and so on. */
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - 42;

    doc.moveTo(MARGIN, y - 10).lineTo(doc.page.width - MARGIN, y - 10).strokeColor(RULE).stroke();

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(note, MARGIN, y, { width: doc.page.width - MARGIN * 2 - 60, lineGap: 1 });

    doc.text(
      `Page ${i - range.start + 1} of ${range.count}`,
      doc.page.width - MARGIN - 60,
      y,
      { width: 60, align: "right" }
    );

    doc.page.margins.bottom = bottomMargin;
  }
}

function newDoc() {
  /* bufferPages so footer() can revisit each page to number it. */
  return new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
}

function patientPairs(data) {
  const years = age(data.dateOfBirth);

  return [
    ["Patient", data.patientName],
    ["Patient ID", data.patientId ? `PT-${data.patientId}` : null],
    ["Age / Gender", [years != null ? `${years} yrs` : null, data.gender].filter(Boolean).join(" · ")],
    ["Blood group", data.bloodGroup],
    ["Phone", data.patientPhone],
    ["Date", formatDate(data.documentDate || new Date().toISOString())],
  ];
}

/* ==================================================================
   PRESCRIPTION
================================================================== */

export function buildPrescriptionPdf(stream, data) {
  const doc = newDoc();
  doc.pipe(stream);

  letterhead(doc, {
    title: "Prescription",
    subtitle: data.doctorName
      ? `${data.doctorName}${data.specialization ? ` · ${data.specialization}` : ""}`
      : null,
  });

  fieldGrid(doc, patientPairs(data));

  sectionHeading(doc, `Medication${data.items.length === 1 ? "" : "s"}`);

  if (data.items.length === 0) {
    paragraph(doc, "No medicines recorded.");
  }

  data.items.forEach((item, index) => {
    if (doc.y > doc.page.height - 150) doc.addPage();

    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`${index + 1}. ${item.medicine}`, MARGIN, doc.y, {
        width: doc.page.width - MARGIN * 2,
      });

    const details = [
      item.dosage ? `Dosage: ${item.dosage}` : null,
      item.frequency ? `Frequency: ${item.frequency}` : null,
      item.duration ? `Duration: ${item.duration}` : null,
    ].filter(Boolean);

    if (details.length) {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(9.5)
        .text(details.join("   ·   "), MARGIN + 14, doc.y + 2, {
          width: doc.page.width - MARGIN * 2 - 14,
        });
    }

    if (item.instructions) {
      doc
        .fillColor(INK)
        .font("Helvetica-Oblique")
        .fontSize(9.5)
        .text(item.instructions, MARGIN + 14, doc.y + 2, {
          width: doc.page.width - MARGIN * 2 - 14,
          lineGap: 2,
        });
    }

    doc.moveDown(0.6);
  });

  if (data.notes) {
    sectionHeading(doc, "Notes");
    paragraph(doc, data.notes);
  }

  /* Signature block sits at the foot of the last content page. */
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.y = Math.max(doc.y + 24, doc.page.height - 150);

  const x = doc.page.width - MARGIN - 200;
  doc.moveTo(x, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor(RULE).stroke();

  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(data.doctorName || "Attending doctor", x, doc.y + 6, { width: 200, align: "right" });

  if (data.specialization) {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8.5)
      .text(data.specialization, x, doc.y + 1, { width: 200, align: "right" });
  }

  footer(
    doc,
    "This prescription is issued electronically by HealthCare Pro and is valid without a physical signature. " +
      "Take medicines only as directed."
  );

  doc.end();
  return doc;
}

/* ==================================================================
   DISCHARGE SUMMARY
================================================================== */

export function buildDischargePdf(stream, data) {
  const doc = newDoc();
  doc.pipe(stream);

  letterhead(doc, {
    title: "Discharge Summary",
    subtitle: data.departmentName || null,
  });

  fieldGrid(doc, [
    ...patientPairs({ ...data, documentDate: data.dischargedOn }),
    ["Admitted on", formatDate(data.admittedOn)],
    ["Discharged on", formatDate(data.dischargedOn)],
    ["Attending doctor", data.doctorName],
    ["Condition at discharge", data.conditionOnDischarge],
  ]);

  sectionHeading(doc, "Diagnosis");
  paragraph(doc, data.diagnosis, { placeholder: "No diagnosis recorded." });

  sectionHeading(doc, "Treatment summary");
  paragraph(doc, data.treatmentSummary, { placeholder: "No treatment summary recorded." });

  sectionHeading(doc, "Medications on discharge");
  paragraph(doc, data.medications, { placeholder: "No medications recorded." });

  sectionHeading(doc, "Follow-up instructions");
  paragraph(doc, data.followUpInstructions, {
    placeholder: "No follow-up instructions recorded.",
  });

  footer(
    doc,
    "Generated by HealthCare Pro. Bring this summary to every follow-up visit. " +
      "In an emergency, contact the hospital immediately."
  );

  doc.end();
  return doc;
}

/* ==================================================================
   PATIENT REPORT
================================================================== */

export function buildReportPdf(stream, data) {
  const doc = newDoc();
  doc.pipe(stream);

  letterhead(doc, { title: data.title || "Medical Report", subtitle: data.type || null });

  fieldGrid(doc, [
    ...patientPairs({ ...data, documentDate: data.reportDate }),
    ["Reference", data.id ? `RPT-${data.id}` : null],
    ["Status", data.status],
  ]);

  sectionHeading(doc, "Findings");
  paragraph(doc, data.result, { placeholder: "No result recorded." });

  sectionHeading(doc, "Notes");
  paragraph(doc, data.description, { placeholder: "No additional notes." });

  footer(
    doc,
    "Generated by HealthCare Pro. Discuss these results with your doctor before acting on them."
  );

  doc.end();
  return doc;
}

/* ==================================================================
   ANALYTICS / HOSPITAL REPORT

   `sections` is a list of { heading, rows: [[label, value], ...] } so
   the analytics export can grow new blocks without this file needing
   to know what they mean.
================================================================== */

export function buildAnalyticsPdf(stream, { title, subtitle, sections, tables = [] }) {
  const doc = newDoc();
  doc.pipe(stream);

  letterhead(doc, { title: title || "Hospital Report", subtitle });

  for (const section of sections || []) {
    sectionHeading(doc, section.heading);
    fieldGrid(doc, section.rows);
    doc.moveDown(0.4);
  }

  for (const table of tables) {
    sectionHeading(doc, table.heading);

    const usable = doc.page.width - MARGIN * 2;
    const colWidth = usable / table.columns.length;

    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5);
    table.columns.forEach((column, index) => {
      doc.text(column.toUpperCase(), MARGIN + index * colWidth, doc.y, {
        width: colWidth - 8,
        continued: index < table.columns.length - 1,
      });
    });

    doc.moveDown(0.4);

    for (const row of table.rows) {
      if (doc.y > doc.page.height - 90) doc.addPage();

      const y = doc.y;
      doc.fillColor(INK).font("Helvetica").fontSize(9.5);

      row.forEach((cell, index) => {
        doc.text(cell == null || cell === "" ? "—" : String(cell), MARGIN + index * colWidth, y, {
          width: colWidth - 8,
        });
      });

      doc.y = y + 15;
    }

    doc.moveDown(0.4);
  }

  footer(doc, `Generated by HealthCare Pro on ${formatDate(new Date().toISOString(), { withTime: true })}.`);

  doc.end();
  return doc;
}

export default {
  buildPrescriptionPdf,
  buildDischargePdf,
  buildReportPdf,
  buildAnalyticsPdf,
};
