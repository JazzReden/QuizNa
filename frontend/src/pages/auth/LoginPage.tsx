import { usePostLogin } from "../../context/PostLoginContext";
import { EducationBackdrop } from "../../components/common/EducationBackdrop";
import {
  PublicHeader,
  PublicFooter,
} from "../../components/common/PublicLayout";
import {
  ExamFormats,
  MonitoringFeature,
} from "../../components/common/PublicFeatures";
import { PasswordInput } from "../../components/common/PasswordInput";
import "../../styles/public-pages.css";
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { safeReturnPath } from "../../utils/return-path";
import { api } from "../../api/client";
import { useAuth } from "../../context/auth-context";
import { ArrowRight, BookOpen, MailCheck } from "lucide-react";

export const LoginPage: React.FC = () => {
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [options, setOptions] = useState<Awaited<
    ReturnType<typeof api.authOptions>
  > | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const demo =
    options?.demoLogin && import.meta.env.VITE_SHOW_DEMO_ACCESS === "true";
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">(() =>
    (typeof location.state?.returnTo === "string" && location.state.returnTo.startsWith("/teacher")) ||
    new URLSearchParams(location.search).get("role") === "teacher"
      ? "teacher"
      : "student",
  );
  const isRegistering =
    new URLSearchParams(location.search).get("mode") === "register" &&
    options?.registration !== false;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  const { login, register, switchDemoUser } = useAuth();
  const navigate = useNavigate();
  const postLogin = usePostLogin();

  useEffect(() => {
    let active = true;
    api
      .authOptions()
      .then((value) => {
        if (active) {
          setOptions(value);
        }
      })
      .catch(() => {
        if (active) setError("Unable to connect. Please reload and try again.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isRegistering && options && !options.teacherRegistration)
      setRole("student");
  }, [isRegistering, options?.teacherRegistration]);

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegistering) {
        if (!fullName.trim() || !email.trim()) {
          throw new Error("Please fill in all required fields");
        }
        if (password !== confirmPassword)
          throw new Error("The passwords do not match");
        const result = await register(
          fullName,
          email,
          options?.teacherRegistration ? role : "student",
          password,
        );
        if (result?.confirmation_required) {
          setConfirmationEmail(email.trim());
          setPassword("");
          setConfirmPassword("");
          return;
        }
      } else {
        if (!email.trim()) {
          throw new Error("Please enter your email");
        }
        await login(email, password, role);
      }
      postLogin?.begin();
      navigate(safeReturnPath(location.state?.returnTo), { replace: true });
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoRole: "teacher" | "student") => {
    setError(null);
    setLoading(true);
    try {
      await switchDemoUser(demoRole);
      postLogin?.begin();
      navigate(demoRole === "teacher" ? "/teacher" : "/student");
    } catch (err: any) {
      setError(err.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setError(null);
    setConfirmationEmail("");
    navigate(
      { pathname: "/login", search: isRegistering ? "" : "?mode=register" },
      { state: location.state, replace: true },
    );
  };

  return (
    <div className="qn-landing qa-auth">
      <PublicHeader />
      <div id="public-content" tabIndex={-1} className="qa-layout ql-container">
        <div className="qa-access">
          <EducationBackdrop />
          <section
            key={isRegistering ? "register" : "login"}
            className="qa-form-panel"
            aria-labelledby="auth-form-title"
          >
            {confirmationEmail ? (
              <div className="qa-confirmation" role="status">
                <span className="qa-confirmation-icon"><MailCheck size={32} aria-hidden="true" /></span>
                <p className="ql-eyebrow">ONE LAST THING</p>
                <h1 id="auth-form-title">Check your email</h1>
                <p>We sent a confirmation link to <strong>{confirmationEmail}</strong>.</p>
                <p>Open the link to confirm your account and enter QuizNa.</p>
                <p className="qa-hint">Can’t find it? Check your spam folder.</p>
                <button className="qn-button-primary qa-submit" onClick={switchMode}>Back to sign in <ArrowRight size={17} /></button>
              </div>
            ) : <>
            <p className="ql-eyebrow">
              {isRegistering ? "LET’S GET STARTED" : "WELCOME BACK"}
            </p>
            <h1 id="auth-form-title">
              {isRegistering ? "Create your account" : "Sign in to QuizNa"}
            </h1>
            <p className="qa-form-description">
              {isRegistering
                ? "A simpler workspace starts here."
                : "Pick up where your classroom left off."}
            </p>
            {demo && !isRegistering && (
              <div className="qa-demo">
                <span>Demo accounts</span>
                {(["teacher", "student"] as const).map((demoRole) => (
                  <button
                    key={demoRole}
                    type="button"
                    className="qn-button-secondary"
                    onClick={() => handleDemoLogin(demoRole)}
                    disabled={loading}
                  >
                    {demoRole === "teacher" ? "Teacher demo" : "Student demo"}
                  </button>
                ))}
              </div>
            )}
            {!options && !error && (
              <p role="status" className="qa-hint">
                Connecting to QuizNa…
              </p>
            )}
            {error && (
              <div role="alert" className="qa-error">
                {error}
              </div>
            )}
            <form
              onSubmit={handleCustomSubmit}
              className="qa-form"
              aria-busy={loading}
            >
              <fieldset className="qa-role" disabled={loading}>
                <legend>Account type</legend>
                <div>
                  {(["teacher", "student"] as const).map((accountRole) => (
                    <button
                      key={accountRole}
                      type="button"
                      aria-pressed={role === accountRole}
                      disabled={
                        isRegistering &&
                        accountRole === "teacher" &&
                        !options?.teacherRegistration
                      }
                      onClick={() => {
                        setRole(accountRole);
                        setError(null);
                      }}
                    >
                      {accountRole === "teacher" ? "Teacher" : "Student"}
                    </button>
                  ))}
                </div>
              </fieldset>
              {isRegistering && (
                <div className="qa-field">
                  <label htmlFor="auth-name">Full name</label>
                  <input
                    type="text"
                    required
                    id="auth-name"
                    autoComplete="name"
                    maxLength={120}
                    placeholder="e.g. Jane Reyes"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}
              <div className="qa-field">
                <label htmlFor="auth-email">Email address</label>
                <input
                  type="email"
                  required
                  id="auth-email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="name@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {options?.passwordLogin && (
                <PasswordInput
                  key={isRegistering ? "new-password" : "current-password"}
                  id="auth-password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={
                    isRegistering ? "new-password" : "current-password"
                  }
                  minLength={isRegistering ? 10 : 1}
                />
              )}
              {isRegistering && options?.passwordLogin && (
                <PasswordInput
                  id="auth-confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  minLength={10}
                  hint="Use 10 to 128 characters."
                />
              )}
              {isRegistering && options && !options.teacherRegistration && (
                <p className="qa-hint">
                  New accounts are students. Contact your administrator for
                  teacher access.
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !options}
                className="qn-button-primary qa-submit"
              >
                <span>
                  {loading
                    ? "Please wait…"
                    : isRegistering
                      ? "Create account"
                      : "Sign in"}
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
            {options?.registration && (
              <p className="qa-switch">
                {isRegistering ? "Already have an account?" : "New to QuizNa?"}{" "}
                <button type="button" onClick={switchMode} disabled={loading}>
                  {isRegistering ? "Sign in instead" : "Create account"}
                </button>
              </p>
            )}
            </>}
          </section>
        </div>
        <section className="qa-intro" aria-labelledby="auth-intro-title">
          <p className="ql-eyebrow">YOUR CLASSROOM, CONNECTED</p>
          <h2 id="auth-intro-title">
            One place for
            <br />
            <span>every kind of quiz.</span>
          </h2>
          <p className="qa-lead">
            From screen to paper, keep assessment simple and your class records
            organized.
          </p>
          <ExamFormats />
          <MonitoringFeature />
          <Link className="qa-guide-link" to="/guide">
            <BookOpen size={17} aria-hidden="true" /> New here? Read the quick
            guide <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <PublicFooter />
    </div>
  );
};
