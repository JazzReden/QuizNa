import { QuizEntryPage } from "./pages/student/QuizEntryPage";
import { SubjectsPage } from "./pages/subjects/SubjectsPage";
import React from "react";
import { PostLoginProvider } from "./context/PostLoginContext";
import { ThemeController } from "./hooks/useTheme";
import { KoalaHelp } from "./components/help/KoalaHelp";
import { PerformancePage } from "./pages/student/PerformancePage";
import { GuidePage } from "./pages/public/GuidePage";
import { LandingPage } from "./pages/public/LandingPage";
import { PaperExamPage } from "./pages/teacher/PaperExamPage";
import { GradebookPage } from "./pages/teacher/GradebookPage";
import { QuestionAnalysisPage } from "./pages/teacher/QuestionAnalysisPage";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth-context";
import { Navbar } from "./components/common/Navbar";
import { LoginPage } from "./pages/auth/LoginPage";
import { TeacherScoresPage } from "./pages/teacher/TeacherScoresPage";
import { QuizEditorPage } from "./pages/teacher/QuizEditorPage";
import { LiveMonitorPage } from "./pages/teacher/LiveMonitorPage";
import { GradingPage } from "./pages/teacher/GradingPage";
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { QuizTakerPage } from "./pages/student/QuizTakerPage";
import { QuizResultPage } from "./pages/student/QuizResultPage";

const RootRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  if (!user) return <LandingPage />;
  return (
    <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />
  );
};

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRole?: "teacher" | "student";
}> = ({ children, allowedRole }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  if (!user)
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: location.pathname + location.search + location.hash,
        }}
      />
    );
  if (allowedRole && user.role !== allowedRole) {
    return (
      <Navigate
        to={user.role === "teacher" ? "/teacher" : "/student"}
        replace
      />
    );
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemeController />
        <PostLoginProvider>
          <div className="quizna-app min-h-screen flex flex-col bg-slate-50 text-slate-900">
            <Navbar />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 min-w-0 outline-none"
            >
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/welcome" element={<LandingPage />} />
                <Route path="/guide" element={<GuidePage />} />

                {/* Teacher Routes */}
                <Route
                  path="/teacher/paper/:quizId"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <PaperExamPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/gradebook"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <GradebookPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/analysis"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <QuestionAnalysisPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <SubjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/leaderboard"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <TeacherScoresPage view="leaderboard" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/class-list"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <TeacherScoresPage view="class-list" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/sections"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <TeacherScoresPage view="sections" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/create"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <QuizEditorPage key="create" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/edit/:id"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <QuizEditorPage key="edit" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/monitor/:quizId"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <LiveMonitorPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/teacher/grading/:quizId"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <GradingPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/teacher/subjects/:subjectId"
                  element={
                    <ProtectedRoute allowedRole="teacher">
                      <SubjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/student/subjects/:subjectId/quiz/:quizId" element={<ProtectedRoute allowedRole="student"><QuizEntryPage /></ProtectedRoute>} />
                <Route
                  path="/student/subjects/:subjectId"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <SubjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/student/activity"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <StudentDashboard />
                    </ProtectedRoute>
                  }
                />
                {/* Student Routes */}
                <Route
                  path="/student/performance"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <PerformancePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/student"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <SubjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/take/:accessCode"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <QuizTakerPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/result/:attemptId"
                  element={
                    <ProtectedRoute allowedRole="student">
                      <QuizResultPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <KoalaHelp />
          </div>
        </PostLoginProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
