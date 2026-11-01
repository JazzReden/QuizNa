import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { AuthProvider } from "../src/context/AuthContext";
import { useAuth } from "../src/context/auth-context";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), me: vi.fn() }));
vi.mock("../src/api/client", () => ({ api: { verifyConfirmationSession: mocks.verify, getMe: mocks.me } }));
function State() {
  const {user,isLoading,confirmationError} = useAuth();
  return <p>{isLoading ? "Loading" : confirmationError || user?.role || "Signed out"}</p>;
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); window.history.replaceState({}, "", "/auth/confirm"); });
afterEach(cleanup);
it("verifies confirmation once, strips tokens immediately and uses the server role", async () => {
  window.history.replaceState({}, "", "/auth/confirm#access_token=confirmed&refresh_token=refresh&type=signup&role=teacher");
  mocks.verify.mockResolvedValue({id:"student",role:"student"});
  render(<StrictMode><AuthProvider><State /></AuthProvider></StrictMode>);
  expect(window.location.hash).toBe("");
  await screen.findByText("student");
  expect(mocks.verify).toHaveBeenCalledTimes(1);
  expect(mocks.verify).toHaveBeenCalledWith("confirmed");
  expect(localStorage.getItem("quizna_token")).toBe("confirmed");
  expect(localStorage.getItem("quizna_refresh")).toBe("refresh");
});
it("does not persist rejected credentials or refresh using another account", async () => {
  window.history.replaceState({}, "", "/auth/confirm#access_token=invalid&refresh_token=bad&type=signup");
  mocks.verify.mockRejectedValue(new Error("Invalid"));
  render(<AuthProvider><State /></AuthProvider>);
  await screen.findByText(/could not sign you in/);
  expect(localStorage.getItem("quizna_token")).toBeNull();
  expect(mocks.me).not.toHaveBeenCalled();
});
it("removes expired link errors and presents a safe recovery message", async () => {
  window.history.replaceState({}, "", "/auth/confirm#error=access_denied&error_description=private-provider-details");
  render(<AuthProvider><State /></AuthProvider>);
  await screen.findByText(/invalid or has expired/);
  expect(window.location.hash).toBe("");
  expect(screen.queryByText(/private-provider-details/)).toBeNull();
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("continues restoring existing password sessions", async () => {
  localStorage.setItem("quizna_token","existing");
  mocks.me.mockResolvedValue({id:"teacher",role:"teacher"});
  render(<AuthProvider><State /></AuthProvider>);
  await waitFor(() => expect(screen.getByText("teacher")).toBeTruthy());
});
