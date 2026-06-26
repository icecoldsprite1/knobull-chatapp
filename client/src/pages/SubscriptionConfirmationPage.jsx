import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';

const formatPlan = (planKey) => {
  if (!planKey) return 'membership';
  return planKey
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function SubscriptionConfirmationPage() {
  const { state } = useLocation();
  const planLabel = formatPlan(state?.planKey);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white px-4 py-10 font-sans">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-xl shadow-emerald-900/5">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
            <CheckCircle className="text-emerald-600" size={34} />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-slate-950">
            Subscription confirmed
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-slate-600">
            Your {planLabel} subscription has been recorded. You can return home or continue to your chat.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Home size={16} />
              Home
            </Link>
            <Link
              to="/chat"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <MessageCircle size={16} />
              Go to Chat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
