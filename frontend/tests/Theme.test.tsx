import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { ThemeController } from "../src/hooks/useTheme";
import { PublicHeader } from "../src/components/common/PublicLayout";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import { ThemeToggle } from "../src/components/common/ThemeToggle";
import { BrandMark } from "../src/components/common/WorkspaceUi";
import { readFileSync } from "node:fs";
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("toggles both views together and remembers the choice", () => {
  document.documentElement.dataset.theme = "light";
  render(
    <>
      <ThemeToggle />
      <ThemeToggle />
    </>,
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Switch to dark mode" })[0],
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("quizna_theme")).toBe("dark");
  expect(
    screen.getAllByRole("button", { name: "Switch to light mode" }),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getAllByRole("button", { name: "Switch to light mode" })[1],
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("quizna_theme")).toBe("light");
});
it("restores a stored preference and works when storage is blocked", () => {
  localStorage.setItem("quizna_theme", "dark");
  render(<ThemeToggle />);
  expect(
    screen.getByRole("button", { name: "Switch to light mode" }),
  ).toBeTruthy();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.theme).toBe("light");
});
it("follows system changes until a user explicitly chooses a theme", () => {
  let listener = () => {};
  const media = {
    matches: false,
    addEventListener: vi.fn((_event, callback) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  render(<ThemeToggle />);
  media.matches = true;
  act(() => listener());
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  media.matches = true;
  act(() => listener());
  expect(document.documentElement.dataset.theme).toBe("light");
});
it("syncs another tab’s saved choice", () => {
  document.documentElement.dataset.theme = "light";
  render(<ThemeToggle />);
  localStorage.setItem("quizna_theme", "dark");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "quizna_theme", newValue: "dark" }),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Switch to light mode" }),
  ).toBeTruthy();
});
it("uses the same koala-and-pen mark for the workspace and favicon", () => {
  const { container } = render(<BrandMark />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "/quizna-campus.png",
  );
  const logo = readFileSync("public/quizna-campus.png");
  expect(logo.subarray(1, 4).toString()).toBe("PNG");
  expect(readFileSync("index.html", "utf8")).toContain(
    'href="/quizna-campus.png"',
  );
});
it("keeps normal text and primary actions readable in both palettes", () => {
  const css = readFileSync("src/styles/theme.css", "utf8");
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
  const light = css.slice(0, css.indexOf("@media screen"));
  const color = (block: string, name: string) =>
    block.match(new RegExp(`--qn-${name}:\\s*(#[0-9a-f]{6})`))![1];
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const palette of [light, dark]) {
    expect(
      contrast(color(palette, "ink"), color(palette, "surface")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(color(palette, "muted"), color(palette, "surface")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(color(palette, "accent"), color(palette, "on-accent")),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

it("keeps public pages light without losing the saved workspace preference", () => {
  localStorage.setItem("quizna_theme", "dark");
  document.documentElement.dataset.theme = "dark";
  render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <ThemeController />
      <Routes>
        <Route
          path="/welcome"
          element={
            <>
              <PublicHeader />
              <Link to="/student">Open workspace</Link>
            </>
          }
        />
        <Route
          path="/login"
          element={
            <>
              <PublicHeader />
              <Link to="/student">Open workspace</Link>
            </>
          }
        />
        <Route
          path="/student"
          element={
            <>
              <ThemeToggle />
              <Link to="/login">Visit sign in</Link>
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("quizna_theme")).toBe("dark");
  expect(
    screen.queryByRole("button", { name: /Switch to .* mode/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Open workspace" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(
    screen.getByRole("button", { name: "Switch to light mode" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Visit sign in" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("quizna_theme")).toBe("dark");
  expect(
    screen.queryByRole("button", { name: /Switch to .* mode/ }),
  ).toBeNull();
});
