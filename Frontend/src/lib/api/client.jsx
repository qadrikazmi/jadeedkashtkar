import { getAnonId } from "@/lib/anonId";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
const TOKEN_STORAGE_KEY = "jk_access_token";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * FastAPI error bodies aren't always { detail: "some string" }:
 * - Pydantic validation errors (422) send detail as an ARRAY of
 *   { msg, loc, type } objects.
 * - Some handlers may send detail as a plain object.
 * Passing any of those straight into `new Error(message)` gets silently
 * coerced by JS to the string "[object Object]" — which is exactly the
 * bug this function fixes, by always producing an actual readable string.
 */
function extractErrorMessage(data, fallback) {
  const detail = data?.detail ?? data?.message;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => (typeof item === "string" ? item : item?.msg))
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }

  if (detail && typeof detail === "object" && typeof detail.msg === "string") {
    return detail.msg;
  }

  return fallback;
}

async function request(path, init) {
  const token = getToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.set("X-Anon-Id", getAnonId());
  }

  // Auto-set Content-Type for JSON payloads
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (networkErr) {
    // A CORS block, DNS failure, or the server being unreachable all land
    // here as a generic "Failed to fetch" — fetch() never gets a response
    // object to inspect. Surfacing this distinctly (instead of letting it
    // propagate as an unlabeled TypeError) makes it obvious in the console
    // that this is a network/CORS-level failure, not an API error response.
    console.error(`[api] network/CORS failure calling ${path}:`, networkErr);
    throw new ApiError(0, "Network error — request was blocked or the server is unreachable");
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = extractErrorMessage(data, message);
    } catch (parseErr) {
      // Response body wasn't valid JSON (e.g. an HTML error page from a
      // proxy/500). Logging this instead of silently swallowing it — a
      // same-origin non-JSON error response reaches here and previously
      // vanished without a trace.
      console.warn(`[api] non-JSON error body for ${path}:`, parseErr);
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined;
  return response.json();
}

export const api = {
  get: (path, options = {}) => 
    request(path, { method: "GET", ...options }),
    
  post: (path, body, options = {}) =>
    request(path, { 
      method: "POST", 
      body: body !== undefined ? JSON.stringify(body) : undefined, 
      ...options 
    }),
    
  patch: (path, body, options = {}) => 
    request(path, { 
      method: "PATCH", 
      body: body !== undefined ? JSON.stringify(body) : undefined, 
      ...options 
    }),
    
  delete: (path, options = {}) => 
    request(path, { method: "DELETE", ...options }),
    
  postForm: (path, formData, options = {}) => 
    request(path, { method: "POST", body: formData, ...options }),

  downloadPdf: async (path, filename = 'recommendation.pdf', options = {}) => {
    const token = getToken();
    const headers = new Headers(options.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      headers.set("X-Anon-Id", getAnonId());
    }

    let response;
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, method: "GET", headers });
    } catch (networkErr) {
      console.error(`[api] network/CORS failure downloading ${path}:`, networkErr);
      throw new ApiError(0, "Network error — request was blocked or the server is unreachable");
    }

    if (!response.ok) {
      let message = "Failed to download file";
      try {
        const data = await response.json();
        message = extractErrorMessage(data, message);
      } catch (parseErr) {
        console.warn(`[api] non-JSON error body downloading ${path}:`, parseErr);
      }
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};