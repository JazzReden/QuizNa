import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Navbar } from "../src/components/common/Navbar";
const mocks = vi.hoisted(() => ({
  user: { id: "teacher", full_name: "Teacher Example", role: "teacher" },
  logout: vi.fn(),
}));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user,
    logout: mocks.logout,
    switchDemoUser: vi.fn(),
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.role = "teacher";
});
afterEach(() => vi.restoreAllMocks());
describe("Workspace navigation", () => {
  it("keeps familiar teacher navigation order, exposes the active page and names sign-out", () => {
    render(
      <MemoryRouter initialEntries={["/teacher/class-list"]}>
        <Navbar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Main navigation" }),
      links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Subjects",
      "Sections",
      "Gradebook",
      "Leaderboard",
    ]);
    expect(within(nav).queryByRole("link", { name: "Class list" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Analysis" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#main-content");
  });
  it("opens the phone menu and closes it after changing pages", () => {
    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Navbar />
      </MemoryRouter>,
    );
    const menu = screen.getByRole("button", { name: "Menu", exact: true });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(
      screen.getByRole("link", { name: "Sections", exact: true }),
    );
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps teacher tools out of student navigation", () => {
    mocks.user.role = "student";
    render(
      <MemoryRouter initialEntries={["/student"]}>
        <Navbar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "My subjects" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Performance" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Gradebook" })).toBeNull();
  });
  it.each(["/login", "/take/CODE"])(
    "keeps %s focused without workspace navigation",
    (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Navbar />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("navigation")).toBeNull();
    },
  );
});
