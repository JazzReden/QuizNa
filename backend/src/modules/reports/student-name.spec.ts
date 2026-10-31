import { studentLastName } from "./student-name";

describe("Surname sorting for full-name profiles", () => {
  it.each([
    ["Jasper Busa Dumasig", "Dumasig"],
    ["Ishi Nadine Go", "Go"],
    ["Juan de la Cruz", "de la Cruz"],
    ["Maria Dela Rosa", "Dela Rosa"],
    ["Ana van der Meer", "van der Meer"],
    ["John Smith Jr.", "Smith"],
    ["John Smith, Jr.", "Smith"],
    ["John Smith III", "Smith"],
    ["Garcia Lopez, Ana Maria", "Garcia Lopez"],
    ["de la Cruz, Juan Jr.", "de la Cruz"],
    ["  Ana   Reyes  ", "Reyes"],
    ["Prince", "Prince"],
    ["", ""],
  ])("sorts %s under %s", (name, expected) => {
    expect(studentLastName(name)).toBe(expected);
  });
});
