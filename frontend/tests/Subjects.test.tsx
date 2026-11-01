import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SubjectsPage } from "../src/pages/subjects/SubjectsPage";
const mock = vi.hoisted(() => ({
  user: { role: "student" },
  api: {
    listSubjects: vi.fn(),
    getSubject: vi.fn(),
    listClasses: vi.fn(),
    listTeacherQuizzes: vi.fn(),
    joinSubject: vi.fn(),
    createSubject: vi.fn(),
    createClass: vi.fn(),
    subjectLeaderboard: vi.fn(),
    setSubjectLeaderboard: vi.fn(),
  },
}));
vi.mock("../src/context/auth-context", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("../src/api/client", () => ({ api: mock.api }));
vi.mock("../src/context/PostLoginContext", () => ({
  useDashboardReady: () => {},
}));
vi.mock("../src/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }));
const room = {
  id: "room",
  name: "Research",
  section_name: "Vincent",
  class_section_id: "class",
  access_code: "SUB-0123456789AB",
  leaderboard_enabled: false,
  quizzes: [],
};
beforeEach(() => {
  mock.user.role = "student";
  mock.api.listSubjects.mockResolvedValue([room]);
  mock.api.getSubject.mockResolvedValue(room);
  mock.api.listClasses.mockResolvedValue([{ id: "class", name: "Vincent" }]);
  mock.api.listTeacherQuizzes.mockResolvedValue([]);
  mock.api.subjectLeaderboard.mockResolvedValue([]);
  mock.api.joinSubject.mockResolvedValue({ id: "room" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(path = "/student") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/student" element={<SubjectsPage />} />
        <Route path="/student/subjects/:subjectId" element={<SubjectsPage />} />
        <Route path="/teacher" element={<SubjectsPage />} />
        <Route path="/teacher/subjects/:subjectId" element={<SubjectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it("joins a subject and opens its quizzes without a leaderboard when closed", async () => {
  show();
  fireEvent.change(await screen.findByLabelText("Subject code"), {
    target: { value: "sub-0123456789ab" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.joinSubject).toHaveBeenCalledWith("SUB-0123456789AB");
  expect(screen.queryByRole("tab", { name: "Leaderboard" })).toBeNull();
  expect(mock.api.subjectLeaderboard).not.toHaveBeenCalled();
});
it("links online quizzes and previous results inside their subject", async () => {
  mock.api.getSubject.mockResolvedValue({
    ...room,
    quizzes: [
      {
        id: "q",
        title: "Research quiz",
        exam_format: "online",
        time_limit_minutes: 20,
        access_code: "S-CODE",
        attempts: [
          {
            id: "a",
            status: "submitted",
            attempt_number: 1,
            score: 8,
            max_score: 10,
          },
        ],
      },
    ],
  });
  show("/student/subjects/room");
  expect(
    (
      await screen.findByRole("link", { name: "Review result · 8/10" })
    ).getAttribute("href"),
  ).toBe("/result/a");
  expect(
    screen.getByRole("link", { name: /Take again/ }).getAttribute("href"),
  ).toBe("/take/S-CODE");
});
it("allows teachers to create a subject with a reusable section", async () => {
  mock.user.role = "teacher";
  mock.api.createSubject.mockResolvedValue(room);
  show("/teacher");
  fireEvent.click(await screen.findByRole("button", { name: "New subject" }));
  fireEvent.change(screen.getByLabelText("Subject name"), {
    target: { value: "Research" },
  });
  await waitFor(() => expect(mock.api.listClasses).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Section"), {
    target: { value: "Vincent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.createSubject).toHaveBeenCalledWith("Research", "class");
  expect(mock.api.createClass).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "New quiz" }).getAttribute("href"),
  ).toContain("subjectRoom=room");
});
it("shows student rankings only when opened by the teacher", async () => {
  mock.api.getSubject.mockResolvedValue({ ...room, leaderboard_enabled: true });
  mock.api.subjectLeaderboard.mockResolvedValue([
    { rank: 1, student_id: "s", name: "Ben Cruz", score: 8, max_score: 10 },
  ]);
  show("/student/subjects/room");
  fireEvent.click(await screen.findByRole("tab", { name: "Leaderboard" }));
  expect(await screen.findByText("Ben Cruz")).toBeTruthy();
  expect(screen.queryByText("Review answers")).toBeNull();
});

it("keeps completed results readable without offering an unavailable new attempt", async () => {
  mock.api.getSubject.mockResolvedValue({
    ...room,
    quizzes: [
      {
        id: "q",
        title: "Completed quiz",
        exam_format: "online",
        time_limit_minutes: 20,
        access_code: "S-CODE",
        can_start: false,
        attempts: [
          {
            id: "a",
            status: "submitted",
            attempt_number: 1,
            score: 8,
            max_score: 10,
          },
        ],
      },
    ],
  });
  show("/student/subjects/room");
  await screen.findByRole("link", { name: "Review result · 8/10" });
  expect(screen.queryByRole("link", { name: /Take again/ })).toBeNull();
});

it("gives an empty teacher subject one clear quiz action and separate class settings", async () => {
  mock.user.role = "teacher";
  show("/teacher/subjects/room");
  const create = await screen.findByRole("link", {
    name: "New quiz",
    exact: true,
  });
  expect(
    screen.getAllByRole("link", { name: "New quiz", exact: true }),
  ).toHaveLength(1);
  expect(create.getAttribute("href")).toBe(
    "/teacher/create?section=class&subjectRoom=room",
  );
  expect(
    screen.getByRole("heading", { name: "Create your first quiz" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /Section gradebook/ })
      .getAttribute("href"),
  ).toBe("/teacher/gradebook?section=class");
  const toggle = screen.getByRole("switch", {
    name: "Open leaderboard to students",
  });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  mock.api.setSubjectLeaderboard.mockResolvedValue({
    ...room,
    leaderboard_enabled: true,
  });
  mock.api.getSubject.mockResolvedValue({ ...room, leaderboard_enabled: true });
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(mock.api.setSubjectLeaderboard).toHaveBeenCalledWith("room", true),
  );
  await screen.findByText("Visible to students");
});
it("filters a populated subject by title and status without changing its quizzes", async () => {
  mock.user.role = "teacher";
  mock.api.getSubject.mockResolvedValue({
    ...room,
    quizzes: [
      {
        id: "a",
        title: "Sampling review",
        exam_format: "online",
        status: "published",
        time_limit_minutes: 20,
        attempts: [],
      },
      {
        id: "b",
        title: "Data collection",
        exam_format: "paper",
        status: "draft",
        attempts: [],
      },
    ],
  });
  show("/teacher/subjects/room");
  fireEvent.change(
    await screen.findByRole("searchbox", { name: "Find a quiz" }),
    { target: { value: "sampling" } },
  );
  expect(screen.getByRole("heading", { name: "Sampling review" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Data collection" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Quiz status" }), {
    target: { value: "draft" },
  });
  expect(screen.getByText("No quizzes match your search.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "Data collection" })).toBeTruthy();
  expect(mock.api.createSubject).not.toHaveBeenCalled();
});

async function fillNewSubject(sectionName = "Grade 12 New") {
  mock.user.role = "teacher";
  show("/teacher");
  fireEvent.click(await screen.findByRole("button", { name: "New subject" }));
  fireEvent.change(screen.getByLabelText("Subject name"), {
    target: { value: "Research" },
  });
  fireEvent.change(screen.getByLabelText("Section"), {
    target: { value: sectionName },
  });
}
it("creates a section inline and assigns the saved subject to it", async () => {
  mock.api.listClasses.mockResolvedValue([]);
  mock.api.createClass.mockResolvedValue({
    id: "new-class",
    name: "Grade 12 New",
  });
  mock.api.createSubject.mockResolvedValue(room);
  await fillNewSubject();
  expect(screen.getByText("New section")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.createClass).toHaveBeenCalledWith("Grade 12 New");
  expect(mock.api.createSubject).toHaveBeenCalledWith("Research", "new-class");
});
it("reuses an existing section despite case and whitespace differences", async () => {
  mock.api.createSubject.mockResolvedValue(room);
  await fillNewSubject("  vINCENT  ");
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.createClass).not.toHaveBeenCalled();
  expect(mock.api.createSubject).toHaveBeenCalledWith("Research", "class");
});
it("retries a failed subject save without creating another section", async () => {
  mock.api.createClass.mockResolvedValue({
    id: "new-class",
    name: "Grade 12 New",
  });
  mock.api.createSubject
    .mockRejectedValueOnce(new Error("Temporary save failure"))
    .mockResolvedValueOnce(room);
  await fillNewSubject();
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByText("Temporary save failure");
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.createClass).toHaveBeenCalledTimes(1);
  expect(mock.api.createSubject).toHaveBeenCalledTimes(2);
  expect(mock.api.createSubject).toHaveBeenLastCalledWith(
    "Research",
    "new-class",
  );
});
it("recovers a duplicate-section conflict from a concurrent create or lost response", async () => {
  mock.api.createClass.mockRejectedValue(
    Object.assign(new Error("Already exists"), { status: 409 }),
  );
  mock.api.createSubject.mockResolvedValue(room);
  await fillNewSubject();
  mock.api.listClasses.mockResolvedValue([
    { id: "saved-class", name: "Grade 12 New" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByRole("tab", { name: "Quizzes" });
  expect(mock.api.createSubject).toHaveBeenCalledWith(
    "Research",
    "saved-class",
  );
});
it("does not save a subject if section creation fails", async () => {
  mock.api.createClass.mockRejectedValue(new Error("Unable to save section"));
  await fillNewSubject();
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByText("Unable to save section");
  expect(mock.api.createSubject).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Section") as HTMLInputElement).value).toBe(
    "Grade 12 New",
  );
});

it("validates a blank subject before creating any section", async () => {
  await fillNewSubject();
  fireEvent.change(screen.getByLabelText("Subject name"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subject" }));
  await screen.findByText("Enter a subject and section name.");
  expect(mock.api.createClass).not.toHaveBeenCalled();
  expect(mock.api.createSubject).not.toHaveBeenCalled();
});

it("filters subjects by section name without changing the source data", async () => {
  mock.api.listSubjects.mockResolvedValue([room,{...room,id:"other",name:"Biology",section_name:"Filomena"}]);
  show();
  await screen.findByRole("link",{name:"Research, Vincent"});
  fireEvent.change(screen.getByRole("textbox",{name:"Find a subject"}),{target:{value:"filomena"}});
  expect(screen.getByRole("link",{name:"Biology, Filomena"})).toBeTruthy();
  expect(screen.queryByRole("link",{name:"Research, Vincent"})).toBeNull();
  fireEvent.change(screen.getByRole("textbox",{name:"Find a subject"}),{target:{value:"missing"}});
  expect(screen.getByText("No matching subjects")).toBeTruthy();
});
