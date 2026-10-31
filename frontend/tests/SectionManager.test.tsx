import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SectionManager } from "../src/components/teacher/SectionManager";
const api = vi.hoisted(() => ({
  listClasses: vi.fn(),
  listRoster: vi.fn(),
  listSections: vi.fn(),
  createClass: vi.fn(),
  removeRosterStudent: vi.fn(),
  attachClass: vi.fn(),
  getClassList: vi.fn(),
  getQuestionAnalysis: vi.fn(),
}));
vi.mock("../src/api/client", () => ({ api }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const classes = [
  { id: "b", name: "Grade 12 St. Vincent", student_count: 1 },
  { id: "a", name: "Grade 12 St. Filomena", student_count: 2 },
];
const students = [
  { id: "1", full_name: "Zoe Adams", email: "zoe@quizna.test" },
  { id: "2", full_name: "Ben Cruz", email: "ben@quizna.test" },
];
function show(path = "/teacher/sections?tab=students") {
  api.listClasses.mockResolvedValue(classes);
  api.listRoster.mockImplementation(async (id: string) =>
    id === "a"
      ? students
      : [{ id: "3", full_name: "Ella Garcia", email: "ella@quizna.test" }],
  );
  api.listSections.mockResolvedValue([
    { id: "assignment-a", class_section_id: "a", access_code: "A-CODE" },
  ]);
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionManager
        quizzes={[{ id: "quiz", title: "Science", status: "published" }] as any}
      />
    </MemoryRouter>,
  );
}

it("shows only section cards on the overview, in alphabetical order", async () => {
  show("/teacher/sections");
  const region = await screen.findByLabelText("Your sections");
  const cards = within(region).getAllByRole("button");
  expect(cards[0].textContent).toContain("Filomena");
  expect(cards[1].textContent).toContain("Vincent");
  expect(screen.queryByRole("button", { name: /Open quiz/ })).toBeNull();
  expect(api.listRoster).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "New section" })).toBeNull();
});
it("opens a dedicated section quiz view and returns to the overview", async () => {
  show("/teacher/sections");
  fireEvent.click(
    within(await screen.findByLabelText("Your sections")).getAllByRole(
      "button",
    )[0],
  );
  expect(await screen.findByRole("heading", { name: "Science" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Grade 12 St. Filomena", level: 1 }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Your sections")).toBeNull();
  expect(screen.queryByLabelText("Search sections")).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Sections", exact: true }),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Quizzes", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen
      .getByRole("link", { name: "New quiz", exact: true })
      .getAttribute("href"),
  ).toBe("/teacher/create?section=a");
  fireEvent.click(screen.getByRole("button", { name: "Back to sections" }));
  expect(await screen.findByLabelText("Your sections")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Science" })).toBeNull();
});
it("retains a section's roster search without showing section overview cards", async () => {
  show("/teacher/sections?section=a&tab=students");
  await screen.findByText("Ben Cruz");
  const rows = screen.getAllByRole("row");
  expect(rows[1].textContent).toContain("Zoe Adams");
  expect(rows[2].textContent).toContain("Ben Cruz");
  fireEvent.change(screen.getByLabelText("Search students"), {
    target: { value: "ben@" },
  });
  expect(screen.queryByText("Zoe Adams")).toBeNull();
  expect(screen.queryByLabelText("Your sections")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search students"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("No matching students.")).toBeTruthy();
});
it("shows only the selected section's assigned quizzes, including direct links", async () => {
  show("/teacher/sections?section=b");
  expect(await screen.findByText(/No quizzes assigned yet/)).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Science" })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Grade 12 St. Vincent", level: 1 }),
  ).toBeTruthy();
});
it("filters overview section cards", async () => {
  show("/teacher/sections");
  await screen.findByLabelText("Your sections");
  fireEvent.change(screen.getByLabelText("Search sections"), {
    target: { value: "vincent" },
  });
  expect(
    within(screen.getByLabelText("Your sections")).getAllByRole("button"),
  ).toHaveLength(1);
});
it("opens class list and analysis inside the quiz with the correct section", async () => {
  api.getClassList.mockResolvedValue({
    rows: [],
    sections: [],
    summary: { submitted: 0, in_progress: 0, not_started: 2 },
  });
  api.getQuestionAnalysis.mockResolvedValue({
    quiz: { id: "quiz", title: "Science" },
    rows: [],
    sections: [],
    submittedCount: 0,
  });
  show("/teacher/sections?section=a");
  fireEvent.click(await screen.findByRole("button", { name: /Open quiz/ }));
  await screen.findByRole("button", { name: "Not started: 2 students" });
  expect(api.getClassList).toHaveBeenCalledWith("quiz", "assignment-a");
  expect(screen.queryByLabelText("Scores section")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Analysis", exact: true }),
  );
  await screen.findByText("No submitted answers for this selection yet.");
  expect(api.getQuestionAnalysis).toHaveBeenCalledWith("quiz", "assignment-a");
  fireEvent.click(
    screen.getByRole("button", { name: /Back to section quizzes/i }),
  );
  expect(await screen.findByRole("button", { name: /Open quiz/ })).toBeTruthy();
  expect(screen.queryByLabelText("Your sections")).toBeNull();
});
