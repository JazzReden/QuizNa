import { Link, Navigate } from "react-router-dom";
import { MailCheck, ArrowRight } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { PublicHeader, PublicFooter } from "../../components/common/PublicLayout";
import { EducationBackdrop } from "../../components/common/EducationBackdrop";
import "../../styles/public-pages.css";

export function ConfirmEmailPage() {
  const { user, isLoading, confirmationError } = useAuth();
  if (!isLoading && user && !confirmationError)
    return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
  return (
    <div className="qn-landing qa-auth">
      <PublicHeader />
      <div id="public-content" className="qa-layout ql-container">
        <div className="qa-access">
          <EducationBackdrop />
          <section className="qa-form-panel qa-confirmation" aria-labelledby="confirmation-title">
            <span className="qa-confirmation-icon"><MailCheck size={32} aria-hidden="true" /></span>
            <h1 id="confirmation-title">{isLoading ? "Opening your classroom…" : "Email confirmation"}</h1>
            <p role={isLoading ? "status" : "alert"}>{isLoading ? "Confirming your account securely." : confirmationError || "Your link has already been used or is missing. Sign in with your email and password to continue."}</p>
            {!isLoading && <Link to="/login" className="qn-button-primary qa-submit">Go to sign in <ArrowRight size={17} /></Link>}
          </section>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
