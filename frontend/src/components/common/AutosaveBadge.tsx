import React from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveBadgeProps {
  status: AutosaveStatus;
}

export const AutosaveBadge: React.FC<AutosaveBadgeProps> = ({ status }) => {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Saving...</span>
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 transition-opacity duration-300">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span>Saved</span>
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
        <span>Retrying save...</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center space-x-1 text-xs text-slate-500">
      <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
      <span>All answers saved</span>
    </span>
  );
};
