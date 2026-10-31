import { AuthService } from "./auth.service";
it("can close local registration without disabling existing account login", async () => {
  const original = process.env.LOCAL_REGISTRATION_ENABLED;
  const db: any = {
    isMysql: true,
    isDemo: true,
    localAuth: {
      register: jest.fn(),
      login: jest.fn().mockResolvedValue({ token: "existing-session" }),
    },
  };
  try {
    process.env.LOCAL_REGISTRATION_ENABLED = "false";
    const auth = new AuthService(db);
    expect(auth.options()).toMatchObject({
      registration: false,
      teacherRegistration: false,
      passwordLogin: true,
    });
    await expect(auth.register({} as any)).rejects.toThrow(
      "Registration is closed",
    );
    expect(db.localAuth.register).not.toHaveBeenCalled();
    await expect(
      auth.login({
        email: "existing@example.test",
        password: "existing-password",
      }),
    ).resolves.toMatchObject({ token: "existing-session" });
  } finally {
    if (original === undefined) delete process.env.LOCAL_REGISTRATION_ENABLED;
    else process.env.LOCAL_REGISTRATION_ENABLED = original;
  }
});
