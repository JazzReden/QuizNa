import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import {
  LogOut,
  Menu,
  X,
  TrendingUp,
  BookOpen,
  Trophy,
  FolderOpen,
  Table2,
  ChartNoAxesColumn,
} from "lucide-react";
import { BrandMark } from "./WorkspaceUi";
import { ThemeToggle } from "./ThemeToggle";
const teacherLinks = [
  { to: "/teacher", label: "Subjects", Icon: BookOpen, end: true },
  { to: "/teacher/sections", label: "Sections", Icon: FolderOpen },
];
const reportLinks = [
  { to: "/teacher/gradebook", label: "Gradebook", Icon: Table2 },
  { to: "/teacher/leaderboard", label: "Leaderboard", Icon: Trophy },
];
const studentLinks = [
  { to: "/student", label: "My subjects", Icon: BookOpen, end: true },
  {
    to: "/student/performance",
    label: "Performance",
    Icon: TrendingUp,
    end: true,
  },
];
export const Navbar: React.FC = () => {
  const { user, logout, switchDemoUser } = useAuth(),
    navigate = useNavigate(),
    location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  if (
    location.pathname.startsWith("/take/") ||
    ["/login", "/", "/welcome", "/guide"].includes(location.pathname)
  )
    return null;
  return (
    <>
      <a href="#main-content" className="qn-skip-link">
        Skip to content
      </a>
      <header className="qn-app-header">
        <div className="qn-shell qn-header-bar">
          <Link
            to={user?.role === "teacher" ? "/teacher" : user ? "/student" : "/"}
            className="qn-brand"
            aria-label="QuizNa home"
          >
            <BrandMark small />
            <span>
              QuizNa<span className="qn-brand-period">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <ThemeToggle />
            {user ? (
              <>
                {import.meta.env.VITE_DEMO_MODE === "true" &&
                  import.meta.env.VITE_SHOW_DEMO_ACCESS === "true" && (
                    <div className="hidden sm:flex gap-2 text-xs">
                      {(["teacher", "student"] as const).map((role) => (
                        <button
                          type="button"
                          key={role}
                          className="qn-button-quiet"
                          onClick={async () => {
                            await switchDemoUser(role);
                            navigate(
                              role === "teacher" ? "/teacher" : "/student",
                            );
                          }}
                        >
                          {role === "teacher" ? "Teacher demo" : "Student demo"}
                        </button>
                      ))}
                    </div>
                  )}
                <div className="qn-profile">
                  <span className="qn-avatar" aria-hidden="true">
                    {user.full_name
                      ?.split(/\s+/)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("") || "U"}
                  </span>
                  <div className="hidden sm:block min-w-0">
                    <p className="qn-profile-name">{user.full_name}</p>
                    <p className="qn-profile-role">
                      {user.role === "teacher" ? "Teacher" : "Student"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="qn-icon-button"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={async () => {
                    await logout();
                    navigate("/login");
                  }}
                >
                  <LogOut size={17} aria-hidden="true" />
                </button>
              </>
            ) : (
              <Link to="/login" className="qn-button-primary">
                Sign in
              </Link>
            )}
          </div>
        </div>
        {user && (
          <div className="qn-nav-border">
            {user.role === "teacher" && (
              <div className="qn-shell qn-mobile-nav">
                <span>Teacher workspace</span>
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls="workspace-navigation"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  {menuOpen ? (
                    <X size={19} aria-hidden="true" />
                  ) : (
                    <Menu size={19} aria-hidden="true" />
                  )}
                  Menu
                </button>
              </div>
            )}
            <nav
              id="workspace-navigation"
              aria-label="Main navigation"
              className={`qn-shell qn-top-nav ${user.role === "teacher" ? "qn-teacher-nav" : ""} ${menuOpen ? "qn-top-nav-open" : ""}`}
            >
              {(user.role === "teacher" ? teacherLinks : studentLinks).map(
                ({ to, label, Icon, end }) => (
                  <NavLink
                    key={to}
                    end={end}
                    to={to}
                    className={({ isActive }) =>
                      `qn-nav-link ${isActive || (to === "/teacher" && location.pathname.startsWith("/teacher/subjects/")) || (to === "/student" && location.pathname.startsWith("/student/subjects/")) ? "qn-nav-link-active" : ""}`
                    }
                  >
                    <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                    {label}
                  </NavLink>
                ),
              )}
              {user.role === "teacher" && (
                <details className="qn-reports-nav" key={location.pathname}>
                  <summary
                    className={`qn-nav-link ${reportLinks.some((link) => location.pathname === link.to) ? "qn-nav-link-active" : ""}`}
                  >
                    <ChartNoAxesColumn size={16} />
                    Reports
                  </summary>
                  <div className="qn-reports-links">
                    {reportLinks.map(({ to, label, Icon }) => (
                      <NavLink key={to} to={to} className="qn-nav-link">
                        <Icon size={16} />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </details>
              )}
            </nav>
          </div>
        )}
      </header>
    </>
  );
};
