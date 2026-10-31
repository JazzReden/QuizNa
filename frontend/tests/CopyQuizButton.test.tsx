import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CopyQuizButton } from "../src/components/subjects/CopyQuizButton";
const api = vi.hoisted(() => ({ listSubjects: vi.fn(), copyQuiz: vi.fn() }));
vi.mock("../src/api/client", () => ({ api }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const show = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <CopyQuizButton
              quizId="source"
              title="Research quiz"
              sectionId="vincent"
            />
          }
        />
        <Route path="/teacher/edit/:id" element={<h1>Copied draft</h1>} />
      </Routes>
    </MemoryRouter>,
  );
it("offers other sections, copies once, and opens the draft", async () => {
  api.listSubjects.mockResolvedValue([
    { id: "same", class_section_id: "vincent", name: "Research" },
    {
      id: "dest",
      class_section_id: "filomena",
      section_name: "Filomena",
      name: "Research",
    },
  ]);
  api.copyQuiz.mockResolvedValue({ id: "copy" });
  show();
  fireEvent.click(screen.getByRole("button", { name: /Copy Research/ }));
  expect(
    await screen.findByRole("option", { name: "Filomena · Research" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("option", { name: "undefined · Research" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Destination subject and section"), {
    target: { value: "dest" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Copy quiz", exact: true }),
  );
  expect(
    await screen.findByRole("heading", { name: "Copied draft" }),
  ).toBeTruthy();
  expect(api.copyQuiz).toHaveBeenCalledWith(
    "source",
    "dest",
    expect.any(String),
  );
});
it("reuses the request identifier after a network failure", async () => {
  api.listSubjects.mockResolvedValue([
    {
      id: "dest",
      class_section_id: "filomena",
      section_name: "Filomena",
      name: "Research",
    },
  ]);
  api.copyQuiz.mockRejectedValue(Error("Try again"));
  show();
  fireEvent.click(screen.getByRole("button", { name: /Copy Research/ }));
  await screen.findByRole("option", { name: "Filomena · Research" });
  fireEvent.change(screen.getByLabelText("Destination subject and section"), {
    target: { value: "dest" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Copy quiz", exact: true }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Copy quiz", exact: true }),
  );
  await screen.findByRole("alert");
  expect(api.copyQuiz.mock.calls[0][2]).toBe(api.copyQuiz.mock.calls[1][2]);
});
