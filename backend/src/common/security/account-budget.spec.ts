import { AccountBudget } from "./account-budget";
it("shares a verified account budget independently of route/IP and bounds memory", () => {
  let now = 0;
  const budget = new AccountBudget(2, 2, () => now);
  budget.check("student");
  budget.check("student");
  expect(() => budget.check("student")).toThrow("Too many requests");
  budget.check("teacher");
  expect(() => budget.check("third")).toThrow("Please retry");
  now = 60001;
  expect(() => budget.check("third")).not.toThrow();
  expect(() => budget.check("student")).not.toThrow();
});
