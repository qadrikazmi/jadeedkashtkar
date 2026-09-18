import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getToken, setToken } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: false,
  });

  const is401Error = meQuery.isError && meQuery.error instanceof ApiError && meQuery.error.status === 401;
  // Treat pure network errors as temporary – keep the user logged in if we already have a token
const isNetworkError =
  meQuery.isError &&
  (!(meQuery.error instanceof ApiError) || meQuery.error.status === 0);

const isAuthenticated =
  (Boolean(meQuery.data) && !is401Error) ||
  (hasToken && isNetworkError);

  // TEMPORARY DEBUG — remove once the /admin issue is resolved
  console.log("AUTH DEBUG:", {
    hasToken,
    isLoading: meQuery.isLoading,
    isError: meQuery.isError,
    error: meQuery.error,
    data: meQuery.data,
    is401Error,
    isAuthenticated,
  });

  if (is401Error && hasToken) {
    setToken(null);
    setHasToken(false);
  }

  async function login(email, password) {
    const token = await authApi.login(email, password);
    setToken(token.access_token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }

  async function signup(email, password, metadata = {}) {
    await authApi.signup(email, password, metadata);
    await login(email, password);
  }

  async function loginAsGuest() {
    const token = await authApi.guest();
    setToken(token.access_token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }

  async function sendResetOtp(email) {
    return authApi.forgotPassword(email);
  }

  async function verifyResetOtp(email, otp) {
    return authApi.verifyResetOtp({ email, code: otp });
  }

  async function resetPasswordWithOtp(email, otp, newPassword) {
    return authApi.resetPasswordWithOtp({
      email,
      code: otp,
      new_password: newPassword,
    });
  }

  function logout() {
    setToken(null);
    setHasToken(false);
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }

  const value = {
    user: isAuthenticated ? meQuery.data : null,
    isLoading: hasToken && meQuery.isLoading,
    isAuthenticated,
    login,
    signup,
    loginAsGuest,
    logout,
    sendResetOtp,
    verifyResetOtp,
    resetPasswordWithOtp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}