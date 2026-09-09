export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function statusColor(status) {
  const map = {
    Stable: "bg-green-100 text-green-700",
    Recovering: "bg-blue-100 text-blue-700",
    Critical: "bg-red-100 text-red-700",
    Confirmed: "bg-green-100 text-green-700",
    Pending: "bg-amber-100 text-amber-700",
    Cancelled: "bg-red-100 text-red-700",
    Paid: "bg-green-100 text-green-700",
    Available: "bg-green-100 text-green-700",
    Completed: "bg-green-100 text-green-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Scheduled: "bg-slate-100 text-slate-700",
  };
  return map[status] || "bg-slate-100 text-slate-700";
}
