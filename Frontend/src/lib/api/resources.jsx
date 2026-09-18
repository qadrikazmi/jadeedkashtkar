import { api, getToken } from "./client";

// --- Auth ---
export const authApi = {
  signup: (email, password, metadata = {}) =>
    api.post("/auth/signup", {
      email,
      password,
      full_name: metadata.full_name,
      phone_number: metadata.phone_number,
    }),

  sendSignupOtp: (data) => api.post("/auth/send-signup-otp", data),
  verifySignupOtp: (data) => api.post("/auth/verify-signup-otp", data),

  login: (email, password) => api.post("/auth/login", { email, password }),

  guest: () => api.post("/auth/guest"),
  me: () => api.get("/auth/me"),
  updateProfile: (patch) => api.patch("/auth/me", patch),
  changePassword: (newPassword) =>
    api.post("/auth/change-password", { new_password: newPassword }),

  forgotPassword: (phoneNumber) =>
    api.post("/auth/forgot-password", { phone_number: phoneNumber }),
  verifyResetOtp: (data) => api.post("/auth/verify-reset-otp", data),
  resetPasswordWithOtp: (data) => api.post("/auth/reset-password", data),

  resetPassword: (token, newPassword) =>
    api.post("/auth/reset-password", { token, new_password: newPassword }),

  sendWhatsappOtp: (data) => api.post("/auth/send-whatsapp-otp", data),
  verifyWhatsappOtp: (data) => api.post("/auth/verify-whatsapp-otp", data),
};

// --- Plans ---
export const plansApi = {
  me: () => api.get("/plans/me"),
  list: () => api.get("/plans"),
};

// --- Announcements ---
export const announcementsApi = {
  active: () => api.get("/announcements/active"),
};

// --- Payments ---
export const paymentsApi = {
  checkout: (planSlug) => api.post("/payments/checkout", { plan_slug: planSlug }),
  mockConfirm: (orderId) => api.post(`/payments/mock/confirm/${orderId}`),
  mockFail: (orderId) => api.post(`/payments/mock/fail/${orderId}`),
  trialEligibility: () => api.get("/payments/trial-eligibility"),
  startTrial: (planSlug) => api.post("/payments/start-trial", { plan_slug: planSlug }),
  mySubscription: () => api.get("/payments/my-subscription"),
};

// --- Admin ---
export const adminApi = {
  // Users
  listUsers: () => api.get("/admin/users"),
  changePlan: (userId, planSlug) =>
    api.patch(`/admin/users/${userId}/plan`, { plan_slug: planSlug }),
  updateUserStatus: (userId, isActive) =>
    api.patch(`/admin/users/${userId}/status`, { is_active: isActive }),

  // Plans (limits + pricing)
  listPlans: () => api.get("/admin/plans"),
  updatePlan: (planId, patch) => api.patch(`/admin/plans/${planId}`, patch),

  // Announcements / banners
  listAnnouncements: () => api.get("/admin/announcements"),
  createAnnouncement: (payload) => api.post("/admin/announcements", payload),
  updateAnnouncement: (id, patch) => api.patch(`/admin/announcements/${id}`, patch),
  deleteAnnouncement: (id) => api.delete(`/admin/announcements/${id}`),
};

// --- Fields ---
function fertilizerRecommendationQuery(params) {
  const search = new URLSearchParams();
  if (params?.soilTier) search.set("soil_tier", params.soilTier);
  if (params?.previousCrop) search.set("previous_crop", params.previousCrop);
  if (params?.variety) search.set("variety", params.variety);
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const fieldsApi = {
  list: () => api.get("/fields"),
  get: (id) => api.get(`/fields/${id}`),
  create: (input) => api.post("/fields", input),
  update: (fieldId, data) => api.patch(`/fields/${fieldId}`, data),
  reanalyze: (fieldId, input) => api.post(`/fields/${fieldId}/reanalyze`, input),
  getJob: (fieldId, jobId) => api.get(`/fields/${fieldId}/jobs/${jobId}`),
  getNdvi: (fieldId) => api.get(`/fields/${fieldId}/ndvi`),
  getCropHealth: (fieldId) => api.get(`/fields/${fieldId}/crop-health`),
  delete: (fieldId) => api.delete(`/fields/${fieldId}`),
  getFertilizerRecommendation: (fieldId, params) =>
    api.get(`/fields/${fieldId}/fertilizer-recommendation${fertilizerRecommendationQuery(params)}`),
   downloadVegetationReportDocx: async (fieldId) => {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
    const token = getToken();
    const response = await fetch(`${base}/fields/${fieldId}/vegetation-report`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download report");
    return response.blob();
  },
 
  downloadFertilizerRecommendationPdf: async (fieldId, params) => {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
    const token = getToken();
    const response = await fetch(
      `${base}/fields/${fieldId}/fertilizer-recommendation/pdf${fertilizerRecommendationQuery(params)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (!response.ok) throw new Error("Failed to download recommendation");
    return response.blob();
  },
};

// --- NDVI (public, index metadata) ---
export const ndviApi = {
  getIndexScales: () => api.get("/ndvi/index-scales"),
};

// --- Settings ---
export const settingsApi = {
  get: () => api.get("/settings"),
  update: (patch) => api.patch("/settings", patch),
};

// --- Weather ---
// CHANGED: forecast() now accepts a `source` ("open_meteo" | "weatherapi"),
// defaulting to open_meteo, so the Dashboard's source switch can request
// either provider from the same endpoint.
export const weatherApi = {
  forecast: (lat, lon, source = "open_meteo") =>
    api.get(`/weather?lat=${lat}&lon=${lon}&source=${source}`),
};

// --- Alerts ---
export const alertsApi = {
  list: (dismissed) =>
    api.get(`/alerts${dismissed !== undefined ? `?dismissed=${dismissed}` : ""}`),
  dismiss: (id) => api.post(`/alerts/${id}/dismiss`),
};

// --- Ledger & report ---
export const ledgerApi = {
  list: () => api.get("/ledger"),
  create: (entry) => api.post("/ledger", entry),
  update: (id, entry) => api.patch(`/ledger/${id}`, entry),
  delete: (id) => api.delete(`/ledger/${id}`),
  listCategories: () => api.get("/ledger/categories"),
  createCategory: (name) => api.post("/ledger/categories", { name }),
  report: (fieldId) => api.get(`/report?field_id=${fieldId}`),
  downloadReportPdf: async (fieldId) => {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
    const token = getToken();
    const response = await fetch(`${base}/report/pdf?field_id=${fieldId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download report");
    return response.blob();
  },
};

// --- Disease scanner ---
export const scansApi = {
  list: () => api.get("/scans"),
  upload: (file) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.postForm("/scans", formData);
  },
  logToLedger: (scanId, fieldId) =>
    api.post(`/scans/${scanId}/log-to-ledger`, { field_id: fieldId }),
};