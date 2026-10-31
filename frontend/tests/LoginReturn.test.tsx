import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LoginPage } from "../src/pages/auth/LoginPage";
import { safeReturnPath } from "../src/utils/return-path";
const login = vi.hoisted(() => vi.fn());
vi.mock("../src/context/auth-context", () => ({ useAuth: () => ({ login }) }));
vi.mock("../src/api/client", () => ({
  api: {
    authOptions: async () => ({
      passwordLogin: true,
      teacherRegistration: true,
    }),
  },
}));
beforeEach(() => login.mockResolvedValue(undefined));
afterEach(() => vi.clearAllMocks());
function Destination() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}
it("returns to Ben's selected paper after password login", async () => {
  const target = "/teacher/paper/exam?sheet=ben";
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/login", state: { returnTo: target } }]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/teacher/paper/:id" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByLabelText("Password");
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "teacher@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText(target)).not.toBeNull();
});
it.each([
  "https://other.example/teacher",
  "//other.example/teacher",
  "/\\other.example",
  "/api/auth/logout",
  null,
])("rejects an unsafe or unsupported login return path: %s", (value) => {
  expect(safeReturnPath(value)).toBe("/");
});
