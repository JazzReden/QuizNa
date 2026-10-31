import { BoundedWork } from "./bounded-work";
it("bounds running and waiting work, preserving FIFO and cleanup on failure", async () => {
  const gate = new BoundedWork(1, 1);
  let release!: () => void;
  const first = gate.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const secondWork = jest.fn(async () => {
    throw new Error("work failed");
  });
  const second = gate.run(secondWork);
  const rejectedSecond = expect(second).rejects.toThrow("work failed");
  expect(secondWork).not.toHaveBeenCalled();
  await expect(gate.run(async () => "overloaded")).rejects.toThrow(
    "Sign-in is busy",
  );
  release();
  await first;
  await rejectedSecond;
  await expect(gate.run(async () => "recovered")).resolves.toBe("recovered");
});
