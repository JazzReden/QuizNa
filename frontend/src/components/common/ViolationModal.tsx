import React from 'react';
import { Dialog } from './Dialog';
import { AlertTriangle, ShieldAlert, XCircle, ArrowRight } from 'lucide-react';

interface ViolationModalProps {
  isOpen: boolean;
  warningCount: number;
  incidentType: string;
  onAcknowledge: () => void;
  onViewResults?: () => void;
}

export const ViolationModal: React.FC<ViolationModalProps> = ({
  isOpen,
  warningCount,
  incidentType,
  onAcknowledge,
  onViewResults,
}) => {
  if (!isOpen) return null;

  const getIncidentLabel = (type: string) => {
    switch (type) {
      case 'tab_hidden':
        return 'Quiz tab hidden';
      case 'window_blur':
        return 'Window Focus Lost';
      case 'fullscreen_exit':
        return 'Fullscreen Mode Exited';
      default:
        return 'Unpermitted Browser Navigation';
    }
  };

  const isTerminated = warningCount >= 3;
  const isFinalWarning = warningCount === 2;

  return (
    <Dialog
      label="Possible violation warning"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 text-center">
        {/* Icon */}
        <div
          className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${
            isTerminated
              ? 'bg-rose-100 text-rose-600'
              : isFinalWarning
                ? 'bg-amber-100 text-amber-600'
                : 'bg-indigo-100 text-indigo-600'
          }`}
        >
          {isTerminated ? (
            <XCircle className="w-9 h-9" />
          ) : isFinalWarning ? (
            <ShieldAlert className="w-9 h-9" />
          ) : (
            <AlertTriangle className="w-9 h-9" />
          )}
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          {isTerminated
            ? 'Quiz submitted after 3 warnings'
            : isFinalWarning
              ? 'Final Warning: Incident 2 of 3'
              : 'Incident Warning 1 of 3'}
        </h3>

        {/* Badge of event */}
        <div className="inline-block px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full mb-4 border border-slate-200">
          Detected: {getIncidentLabel(incidentType)}
        </div>

        {/* Message */}
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          {isTerminated ? (
            <>
              Your quiz has stopped. Saved answers have been submitted to your
              teacher.
            </>
          ) : isFinalWarning ? (
            <>
              This is your{' '}
              <strong className="text-amber-700 font-semibold">
                FINAL WARNING
              </strong>
              . The next focus incident will submit your saved answers and end
              the quiz.
            </>
          ) : (
            <>
              Stay on this quiz in fullscreen. Your teacher can review this
              possible violation.
            </>
          )}
        </p>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          {isTerminated ? (
            <button
              type="button"
              onClick={onViewResults}
              className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
            >
              <span>View Submission Summary</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onAcknowledge}
              className={`w-full sm:w-auto px-6 py-2.5 text-white text-sm font-semibold rounded-xl shadow-md transition-all ${
                isFinalWarning
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              Return to Fullscreen & Resume
            </button>
          )}
        </div>

        {/* Proctoring disclaimer */}
        <p className="mt-5 text-[11px] text-slate-400">
          Focus changes are possible violations, not proof of cheating.
        </p>
      </div>
    </Dialog>
  );
};
