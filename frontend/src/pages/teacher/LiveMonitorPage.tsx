import { createClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowLeft,
  Radio,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";

export const LiveMonitorPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchLiveFeed = useCallback(async () => {
    if (!quizId) return;
    try {
      const res = await api.getLiveFeed(quizId);
      setData(res);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch live monitoring feed");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    fetchLiveFeed();
  }, [fetchLiveFeed]);

  // Realtime invalidates the authenticated API feed. RLS limits events to this teacher.
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (
      !autoRefresh ||
      !quizId ||
      !url ||
      !key ||
      import.meta.env.VITE_DEMO_MODE === "true"
    )
      return;
    const client = createClient(url, key, {
      accessToken: async () => localStorage.getItem("quizna_token"),
    });
    let refreshTimer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void fetchLiveFeed(), 250);
    };
    const channel = client
      .channel(`quizna-monitor:${quizId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quiz_attempts",
          filter: `quiz_id=eq.${quizId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attempt_answers" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_incidents" },
        changed,
      )
      .subscribe();
    return () => {
      clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [autoRefresh, quizId, fetchLiveFeed]);

  // Polling remains a fallback when realtime is disconnected.
  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLiveFeed();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLiveFeed]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const students = data?.students || [];
  const inProgressCount = students.filter(
    (s: any) => s.attempt.status === "in_progress",
  ).length;
  const submittedCount = students.filter(
    (s: any) => s.attempt.status === "submitted",
  ).length;
  const terminatedCount = students.filter(
    (s: any) => s.attempt.status === "terminated_violation",
  ).length;

  // Flatten all incidents
  const allIncidents: any[] = [];
  students.forEach((s: any) => {
    (s.incidents || []).forEach((inc: any) => {
      allIncidents.push({
        ...inc,
        studentName: s.student?.full_name || "Unknown Student",
      });
    });
  });
  allIncidents.sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return (
    <div className="qn-page qn-records">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/teacher"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Radio className="w-3 h-3 mr-1 text-emerald-600 animate-pulse" />
                Live progress
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Code: {data?.quiz?.access_code}
              </span>
            </div>
            <h1 className="qn-title mt-1">{data?.quiz?.title}</h1>
          </div>
        </div>

        {/* Polling & Refresh controls */}
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5 text-indigo-600 rounded-xs"
            />
            <span>Live updates</span>
          </label>

          <button
            type="button"
            onClick={fetchLiveFeed}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
            title="Manual refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Proctoring disclaimer banner */}
      <div className="mt-4 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start space-x-2">
        <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p>
          Focus incidents are possible violations, not proof of cheating. A
          third warning submits saved answers. Consider technical issues when
          reviewing incidents.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 my-6">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Taking quiz
          </p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {inProgressCount}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Submitted
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {submittedCount}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Stopped after warnings
          </p>
          <p className="text-2xl font-bold text-rose-600 mt-1">
            {terminatedCount}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Incidents
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {allIncidents.length}
          </p>
        </div>
      </div>

      {/* Main Grid: Student Roster vs. Live Event Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Cards (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Students ({students.length})
          </h2>

          {students.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-xs text-slate-500">
                No students have joined this quiz yet. Share the access code{" "}
                <strong className="text-indigo-600">
                  {data?.quiz?.access_code}
                </strong>{" "}
                with your class.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {students.map((item: any) => {
                const att = item.attempt;
                const student = item.student;
                const warningCount = att.warning_count || 0;

                const statusStyles: Record<
                  string,
                  { bg: string; text: string; label: string }
                > = {
                  in_progress: {
                    bg: "bg-indigo-50 border-indigo-200",
                    text: "text-indigo-700",
                    label: "In Progress",
                  },
                  submitted: {
                    bg: "bg-emerald-50 border-emerald-200",
                    text: "text-emerald-700",
                    label: "Submitted",
                  },
                  timed_out: {
                    bg: "bg-amber-50 border-amber-200",
                    text: "text-amber-700",
                    label: "Timed Out",
                  },
                  terminated_violation: {
                    bg: "bg-rose-50 border-rose-200",
                    text: "text-rose-700",
                    label: "Stopped after warnings",
                  },
                };

                const currentStyle =
                  statusStyles[att.status] || statusStyles.in_progress;

                return (
                  <div
                    key={att.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                          {student?.full_name?.charAt(0) || "S"}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {student?.full_name || "Anonymous Student"}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {student?.email}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${currentStyle.bg} ${currentStyle.text}`}
                      >
                        {currentStyle.label}
                      </span>
                    </div>

                    {/* Strikes Badge Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Warnings:</span>
                      <div className="flex items-center space-x-1">
                        {[1, 2, 3].map((strike) => (
                          <span
                            key={strike}
                            className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                              warningCount >= strike
                                ? strike === 3
                                  ? "bg-rose-600 text-white"
                                  : strike === 2
                                    ? "bg-amber-500 text-white"
                                    : "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {strike}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Progress Info */}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Questions Answered:</span>
                      <span className="font-semibold text-slate-700">
                        {item.answeredCount} answered
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Incident Log Ticker */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <AlertTriangle className="w-4 h-4 text-amber-500 mr-1.5" />
              Focus incidents
            </h2>
            <span className="text-[11px] text-slate-400">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          </div>

          {allIncidents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No violation incidents recorded yet. Clean session.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {allIncidents.map((inc: any) => (
                <div
                  key={inc.id}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      {inc.studentName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-sm ${
                        inc.warning_number >= 3
                          ? "bg-rose-100 text-rose-700"
                          : inc.warning_number === 2
                            ? "bg-amber-100 text-amber-700"
                            : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {inc.details?.action === "teacher_pardon"
                        ? "Warning removed"
                        : `Warning ${inc.warning_number}`}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    {inc.details?.action === "teacher_pardon"
                      ? "Teacher removed a warning"
                      : inc.incident_type === "tab_hidden"
                        ? "Switched tab / Minimized browser"
                        : inc.incident_type === "window_blur"
                          ? "Lost browser window focus"
                          : "Exited fullscreen mode"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(inc.occurred_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
