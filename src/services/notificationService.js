import api, { unwrap } from "./api.js";

export const notificationService = {
  list: (params = {}) => unwrap(api.get("/notifications", { params })),

  markRead: (id) => unwrap(api.patch(`/notifications/${id}/read`)),

  markAllRead: () => unwrap(api.patch("/notifications/read-all")),
};

export default notificationService;
