import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LoginPage } from "../src/pages/auth/LoginPage";
import { GuidePage } from "../src/pages/public/GuidePage";
const auth = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  options: {
    registration: true,
    passwordLogin: true,
    teacherRegistration: true,
  },
}));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ login: auth.login, register: auth.register }),
}));
vi.mock("../src/api/client", () => ({
  api: { authOptions: async () => auth.options },
}));
beforeEach(() => {
  auth.options.registration = true;
  auth.options.teacherRegistration = true;
  auth.register.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(path = "/login", returnTo = "/") {
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: path.split("?")[0],
          search: path.includes("?") ? `?${path.split("?")[1]}` : "",
          state: { returnTo },
        },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/teacher/paper/exam" element={<p>Selected exam</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it("toggles password visibility without changing the value or submitting", async () => {
  show();
  const input = (await screen.findByLabelText("Password")) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "sample-password" } });
  expect(input.type).toBe("password");
  fireEvent.click(
    screen.getByRole("button", { name: "Show password", exact: true }),
  );
  expect(input.type).toBe("text");
  expect(input.value).toBe("sample-password");
  const toggle = screen.getByRole("button", {
    name: "Hide password",
    exact: true,
  });
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(toggle);
  expect(input.type).toBe("password");
  expect(auth.login).not.toHaveBeenCalled();
});
it("toggles confirmation independently and hides passwords when changing modes", async () => {
  show("/login?mode=register");
  const password = (await screen.findByLabelText(
    "Password",
  )) as HTMLInputElement;
  const confirm = screen.getByLabelText("Confirm password") as HTMLInputElement;
  fireEvent.click(
    screen.getByRole("button", { name: "Show confirm password" }),
  );
  expect(confirm.type).toBe("text");
  expect(password.type).toBe("password");
  fireEvent.click(
    screen.getByRole("button", { name: "Show password", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in instead" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe(
    "password",
  );
});
it("registers the selected role and preserves the exam return destination after mode switching", async () => {
  show("/login", "/teacher/paper/exam");
  fireEvent.click(
    await screen.findByRole("button", { name: "Create account", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Test Teacher" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "teacher@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "sample-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "sample-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Teacher", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Create account", exact: true }),
  );
  expect(await screen.findByText("Selected exam")).not.toBeNull();
  expect(auth.register).toHaveBeenCalledWith(
    "Test Teacher",
    "teacher@example.test",
    "teacher",
    "sample-password",
  );
});
it("shows mismatch feedback without registering", async () => {
  show("/login?mode=register");
  await screen.findByLabelText("Confirm password");
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Student" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "student@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "sample-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "another-password" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create account", exact: true }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "passwords do not match",
  );
  expect(auth.register).not.toHaveBeenCalled();
});
it("respects server-disabled registration even with a registration URL", async () => {
  auth.options.registration = false;
  show("/login?mode=register");
  await screen.findByLabelText("Password");
  expect(screen.queryByLabelText("Full name")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Create account", exact: true }),
  ).toBeNull();
});
it("shares the footer and clear format and monitoring information on sign in", async () => {
  show();
  await screen.findByLabelText("Password");
  expect(screen.getByRole("heading", { name: "Online quiz" })).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Paper exam" })).not.toBeNull();
  expect(
    screen.getByText(/Browser signals are not proof of cheating/),
  ).not.toBeNull();
  expect(screen.getByRole("contentinfo").textContent).toContain(
    "QuizNa. All rights reserved.",
  );
});
it("switches between teacher and student tutorials and explains monitoring limits", () => {
  show("/guide");
  expect(
    screen.getByRole("heading", { name: "Set up your first quiz" }),
  ).not.toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "For students" }));
  expect(
    screen.getByRole("heading", { name: "Before your exam" }),
  ).not.toBeNull();
  expect(
    screen
      .getByRole("link", { name: "For students" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getByRole("heading", { name: "Online quiz" })).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Paper exam" })).not.toBeNull();
  expect(
    screen.getByText(/Attempt finalized using saved answers/),
  ).not.toBeNull();
  expect(
    screen.getByText(/cannot monitor other devices or prevent all cheating/),
  ).not.toBeNull();
});

it.each(["Teacher", "Student"])("sends the selected %s account type on sign in", async (label) => {
  show();
  fireEvent.click(await screen.findByRole("button", {name:label,exact:true}));
  fireEvent.change(screen.getByLabelText("Email address"),{target:{value:"account@example.test"}});
  fireEvent.change(screen.getByLabelText("Password"),{target:{value:"sample-password"}});
  fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
  expect(auth.login).toHaveBeenCalledWith("account@example.test","sample-password",label.toLowerCase());
});
it("keeps teacher sign in available when public teacher registration is disabled", async () => {
  auth.options.teacherRegistration=false;
  show();
  expect((await screen.findByRole("button",{name:"Teacher",exact:true}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Create account",exact:true}));
  expect((screen.getByRole("button",{name:"Teacher",exact:true}) as HTMLButtonElement).disabled).toBe(true);
});

it("shows a success screen after registration pending email confirmation", async () => {
  auth.register.mockResolvedValue({ confirmation_required: true });
  show("/login?mode=register");
  await screen.findByLabelText("Password");
  fireEvent.change(screen.getByLabelText("Full name"), {target:{value:"New Student"}});
  fireEvent.change(screen.getByLabelText("Email address"), {target:{value:"new@example.com"}});
  fireEvent.change(screen.getByLabelText("Password"), {target:{value:"safe-password"}});
  fireEvent.change(screen.getByLabelText("Confirm password"), {target:{value:"safe-password"}});
  fireEvent.click(screen.getByRole("button", {name:"Create account", exact:true}));
  expect(await screen.findByRole("heading", {name:"Check your email"})).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByLabelText("Password")).toBeNull();
});
