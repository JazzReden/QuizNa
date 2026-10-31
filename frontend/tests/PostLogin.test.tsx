import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostLoginProvider, useDashboardReady, usePostLogin } from "../src/context/PostLoginContext";
import { chooseLoadingQuote, loadingQuotes, POST_LOGIN_MIN_MS, ROLE_QUOTE_CATEGORIES } from "../src/config/loadingQuotes";
import { LoginPage } from "../src/pages/auth/LoginPage";
const state = vi.hoisted(() => ({ user: { role: "teacher" as "teacher" | "student" }, login: vi.fn() }));
vi.mock("../src/context/auth-context", () => ({ useAuth: () => ({user: state.user, isLoading: false, login: state.login, register: vi.fn()}) }));
vi.mock("../src/api/client", () => ({ api: { authOptions: async () => ({ registration: true, teacherRegistration: true, passwordLogin: true }) } }));
function Dashboard({ loading }: {loading: boolean}) {
  useDashboardReady(loading);
  const context = usePostLogin();
  return <><button onClick={() => context?.begin()}>Log in successfully</button><h1>Dashboard</h1></>;
}
function show(loading = false) {
  return render(<MemoryRouter initialEntries={["/teacher"]}><PostLoginProvider><Dashboard loading={loading}/></PostLoginProvider></MemoryRouter>);
}
beforeEach(() => { localStorage.clear(); state.user = {role:"teacher"}; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(["teacher", "student"] as const)("keeps the %s welcome visible for the full 6.8 seconds", role => {
  vi.useFakeTimers(); state.user = {role};
  show(); fireEvent.click(screen.getByRole("button",{name:"Log in successfully"}));
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(`Preparing your ${role} dashboard`);
  act(() => vi.advanceTimersByTime(POST_LOGIN_MIN_MS - 1));
  expect(screen.getByRole("status")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("heading", {name:"Dashboard"})).toBeTruthy();
});
it("waits past 6.8 seconds until dashboard data settles", () => {
  vi.useFakeTimers();
  const page=show(true); fireEvent.click(screen.getByRole("button",{name:"Log in successfully"}));
  act(() => vi.advanceTimersByTime(7000)); expect(screen.getByRole("status")).toBeTruthy();
  page.rerender(<MemoryRouter initialEntries={["/teacher"]}><PostLoginProvider><Dashboard loading={false}/></PostLoginProvider></MemoryRouter>);
  expect(screen.queryByRole("status")).toBeNull();
});
it("uses the correct role pools, exact supplied text, and avoids immediate repetition", () => {
  expect(loadingQuotes).toHaveLength(25);
  for (const role of ["teacher","student"] as const) {
    for(let i=0;i<40;i++) {
      const previous=localStorage.getItem("quizna_last_loading_quote");
      const quote=chooseLoadingQuote(role);
      expect(quote.id).not.toBe(previous);
      expect(ROLE_QUOTE_CATEGORIES[role]).toContain(quote.category);
    }
  }
  expect(loadingQuotes.find(q=>q.id==="love-1")?.text).toBe("Whoever does not love does not know God, because God is love.");
});
it("shows an author prefix for education quotes and only the reference for verses", () => {
  vi.spyOn(Math,"random").mockReturnValue(.9999);
  show(); fireEvent.click(screen.getByRole("button",{name:"Log in successfully"}));
  expect(screen.getByRole("status").textContent).toContain("- Plutarch");
  cleanup(); vi.spyOn(Math,"random").mockReturnValue(0);
  show(); fireEvent.click(screen.getByRole("button",{name:"Log in successfully"}));
  expect(screen.getByRole("status").textContent).toContain("1 John 4:8");
  expect(screen.getByRole("status").textContent).not.toContain("- 1 John");
});
it("leaves failed authentication on the normal form without the welcome screen", async () => {
  state.login.mockRejectedValueOnce(new Error("Invalid email or password"));
  render(<MemoryRouter initialEntries={["/login"]}><PostLoginProvider><LoginPage/></PostLoginProvider></MemoryRouter>);
  await screen.findByLabelText("Password");
  fireEvent.change(screen.getByLabelText("Email address"),{target:{value:"test@quizna.test"}});
  fireEvent.change(screen.getByLabelText("Password"),{target:{value:"wrong-password"}});
  fireEvent.click(screen.getByRole("button",{name:"Sign in",exact:true}));
  expect(await screen.findByText("Invalid email or password")).toBeTruthy();
  expect(document.querySelector('.qn-post-login')).toBeNull();
});
