import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LandingPage } from "../src/pages/public/LandingPage";
import { LoginPage } from "../src/pages/auth/LoginPage";
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ login: vi.fn(), register: vi.fn() }),
}));
vi.mock("../src/api/client", () => ({
  api: {
    authOptions: async () => ({
      registration: true,
      passwordLogin: true,
      teacherRegistration: true,
    }),
  },
}));
vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
afterEach(cleanup);
function showLanding() {
  render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it("opens the existing sign-in form from the landing page", async () => {
  showLanding();
  fireEvent.click(
    screen.getAllByRole("link", { name: "Sign in", exact: true })[0],
  );
  expect(await screen.findByLabelText("Password")).not.toBeNull();
  expect(screen.queryByLabelText("Full name")).toBeNull();
});
it("opens registration directly and allows switching back to sign in", async () => {
  showLanding();
  fireEvent.click(screen.getByRole("link", { name: "Get started" }));
  expect(await screen.findByLabelText("Full name")).not.toBeNull();
  await screen.findByRole("button", { name: "Teacher", exact: true });
  fireEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
  expect(screen.queryByLabelText("Full name")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Sign in", exact: true }),
  ).not.toBeNull();
});
it("includes the requested footer destinations with labelled social icons", () => {
  showLanding();
  const destinations = {
    TikTok:
      "https://www.tiktok.com/@jasperdumasig?is_from_webapp=1&sender_device=pc",
    Instagram: "https://www.instagram.com/jasreden/",
    Facebook: "https://www.facebook.com/REDENJAS",
  };
  for (const [label, href] of Object.entries(destinations)) {
    const link = screen.getByRole("link", { name: label, exact: true });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  }
  expect(
    screen.getByRole("link", { name: "Email QuizNa" }).getAttribute("href"),
  ).toBe("mailto:dumasigjasper@gmail.com");
  expect(screen.getByRole("contentinfo").textContent).toContain(
    `© ${new Date().getFullYear()} QuizNa. All rights reserved.`,
  );
});

it("reveals sections once on entering view and disconnects on navigation", () => {
  let onIntersect: IntersectionObserverCallback = () => {};
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersect = callback;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
  try {
    showLanding();
    const section = screen
      .getByRole("heading", { name: "One workspace. Two ways to assess." })
      .closest("section")!;
    expect(observe).toHaveBeenCalledTimes(3);
    expect(section.classList.contains("ql-reveal-ready")).toBe(true);
    onIntersect(
      [{ target: section, isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(section.classList.contains("ql-revealed")).toBe(true);
    expect(unobserve).toHaveBeenCalledWith(section);
    cleanup();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps content visible without observers or when reduced motion is preferred", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: query.includes(": reduce)") })),
  );
  const observer = vi.fn();
  vi.stubGlobal("IntersectionObserver", observer);
  try {
    showLanding();
    expect(observer).not.toHaveBeenCalled();
    expect(document.querySelector(".ql-reveal-ready")).toBeNull();
    cleanup();
    vi.stubGlobal("IntersectionObserver", undefined);
    showLanding();
    expect(document.querySelector(".ql-reveal-ready")).toBeNull();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

it("switches the sample exam preview without leaving the page", () => {
  showLanding();
  expect(
    screen.getByLabelText("Paper exam demonstration: scan, review answers, confirm and save"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Online quiz" }));
  expect(
    screen.getByLabelText("Online quiz demonstration: choose answers, autosave and submit"),
  ).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "Online quiz" }).getAttribute("value"),
  ).toBe("online");
  expect(
    screen.queryByRole("button", { name: /Switch to .* mode/ }),
  ).toBeNull();
  expect(screen.getByRole("link", { name: "Get started" })).toBeTruthy();
});

it("uses muted inline loops and supports keyboard pause without a separate button", () => {
  showLanding();
  const video = document.querySelector("video")!;
  expect(video.loop).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(video.getAttribute("preload")).toBe("none");
  expect(document.querySelector(".ql-capabilities")).toBeNull();
  fireEvent.play(video);
  fireEvent.keyDown(video, { key: "Enter" });
  expect(video.pause).toHaveBeenCalled();
  fireEvent.pause(video);
  expect(document.querySelector(".ql-video-toggle")).toBeNull();
  expect(video.getAttribute("aria-pressed")).toBe("true");
});
