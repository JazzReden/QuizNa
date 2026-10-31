import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Instagram, Facebook, Mail } from "lucide-react";
import { BrandMark } from "./WorkspaceUi";
import "../../styles/landing.css";
const socialLinks = [
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@jasperdumasig?is_from_webapp=1&sender_device=pc",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.6 2c.3 2.4 1.7 3.8 4 4v3.3a8.2 8.2 0 0 1-4-1.2v7.1a6.4 6.4 0 1 1-5.5-6.3v3.4a3.1 3.1 0 1 0 2.2 3V2h3.3Z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/jasreden/",
    icon: <Instagram aria-hidden="true" />,
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/REDENJAS",
    icon: <Facebook aria-hidden="true" />,
  },
  {
    label: "Email QuizNa",
    href: "mailto:dumasigjasper@gmail.com",
    icon: <Mail aria-hidden="true" />,
  },
];

export function PublicHeader() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
    else if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [pathname, hash]);
  return (
    <>
      <a href="#public-content" className="qn-skip-link">
        Skip to content
      </a>
      <div className="ql-header-sticky"><header className="ql-header ql-container">
        <Link to="/welcome" className="qn-brand" aria-label="QuizNa home">
          <BrandMark small />
          <span>
            QuizNa<span className="qn-brand-period">.</span>
          </span>
        </Link>
        <nav aria-label="Website navigation" className="ql-nav">
          <a href="/welcome#features" className="ql-feature-link">
            Features
          </a>
          <Link to="/guide" className="ql-guide-link">
            Quick guide
          </Link>
          <Link to="/login" className="ql-sign-in">
            Sign in
          </Link>
          <Link
            to="/login?mode=register"
            className="qn-button-primary ql-register-link"
          >
            Create account <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </header></div>
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="ql-footer" role="contentinfo">
      <div className="ql-container">
        <div className="ql-footer-top">
          <div className="ql-footer-about">
            <Link to="/welcome" className="qn-brand" aria-label="QuizNa home">
              <BrandMark small />
              <span>QuizNa.</span>
            </Link>
            <p>
              More teaching.
              <br />
              Less busywork.
            </p>
          </div>
          <div className="ql-footer-links">
            <span>Explore</span>
            <a href="/welcome#features">Features</a>
            <Link to="/guide">Quick guide</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/login?mode=register">Create account</Link>
          </div>
          <div className="ql-footer-connect">
            <span>Let’s connect</span>
            <a className="ql-email" href="mailto:dumasigjasper@gmail.com">
              dumasigjasper@gmail.com
            </a>
            <nav aria-label="Social media and contact" className="ql-socials">
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  aria-label={link.label}
                  {...(link.href.startsWith("https:")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {link.icon}
                </a>
              ))}
            </nav>
          </div>
        </div>
        <div className="ql-footer-bottom">
          <p>© {new Date().getFullYear()} QuizNa. All rights reserved.</p>
          <span>Made for the everyday classroom.</span>
        </div>
      </div>
    </footer>
  );
}
