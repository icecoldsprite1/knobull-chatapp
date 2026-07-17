import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Users,
  MessageCircle,
  CheckCircle,
  CreditCard,
  Sparkles,
  ShieldCheck,
  Plus,
  Minus,
} from 'lucide-react';

/**
 * AdminGuidePage
 *
 * A plain-English operating procedure for advisors/administrators. It explains
 * the member journey (try-us-out trial -> free membership -> paid plans) and the
 * day-to-day steps for handling each kind of user in the Advisor Dashboard.
 *
 * Linked from the Advisor Dashboard header. Admin-only route (see App.jsx).
 */

// Membership tiers, kept in sync with server/src/utils/constants.js and the
// PayPal plans on the landing page.
const TIERS = [
  {
    name: 'Try us out (guest trial)',
    icon: Sparkles,
    accent: 'bg-amber-50 border-amber-200 text-amber-700',
    limit: '1 chat total (one time)',
    price: 'Free — no account',
    how: 'Anyone can start one real chat from the "Try It Free" box on the home page. No sign-up needed.',
  },
  {
    name: 'Free membership',
    icon: Users,
    accent: 'bg-blue-50 border-blue-200 text-blue-700',
    limit: '2 chats per week',
    price: 'Free',
    how: 'The guest creates a free account (email + verify). Their trial chat carries over into the new account.',
  },
  {
    name: 'Standard',
    icon: CreditCard,
    accent: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    limit: '5 chats per week',
    price: '$30 / month · $300 / year',
    how: 'A signed-in student subscribes through PayPal on the home page.',
  },
  {
    name: 'Unlimited',
    icon: CreditCard,
    accent: 'bg-violet-50 border-violet-200 text-violet-700',
    limit: 'Unlimited chats',
    price: '$90 / month · $900 / year',
    how: 'A signed-in student subscribes through PayPal on the home page.',
  },
];

const DAILY_STEPS = [
  {
    title: 'Sign in as an advisor',
    body: 'Open the site, choose the Advisor Gateway, and log in with your advisor account. You land on the Advisor Dashboard.',
  },
  {
    title: 'Scan the queue',
    body: 'The dashboard lists every open chat. Chats that need your attention are sorted to the top: active paying members waiting on a reply first, then other active members, with no-membership chats at the bottom. A "Needs reply" flag means the student\'s last message is newer than the last advisor reply.',
  },
  {
    title: 'Pick the right tab',
    body: 'Mine = chats assigned to you. Unclaimed = chats no advisor has taken yet. Claimed = chats another advisor is handling (you can view but not reply).',
  },
  {
    title: 'Claim a chat',
    body: 'From Unclaimed, click Claim to make the chat yours. Claiming prevents two advisors from replying to the same student. If you claimed one by mistake, use Unclaim to send it back to the queue.',
  },
  {
    title: 'Reply',
    body: 'Open the chat, type your answer, and send. The student sees your reply live. You can exchange as many messages as needed within one chat — there is no per-message limit.',
  },
  {
    title: 'Resolve when finished',
    body: 'When the question is fully answered, mark the chat Resolved. This closes the session. Resolving is what "uses up" one of the student\'s weekly chats and lets them start a fresh one when they need more help.',
  },
];

function SectionCard({ children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm shadow-slate-900/5 p-6 md:p-8">
      {children}
    </section>
  );
}

export default function AdminGuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white text-sm font-semibold mb-5 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <BookOpen size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold tracking-tight">Advisor &amp; Membership Guide</h1>
              <p className="text-slate-300 text-sm mt-0.5">How memberships work, and how to handle each kind of user.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* 1. Member journey */}
        <SectionCard>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Step 1</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">The member journey</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            Every user moves through the same funnel. They can <span className="font-semibold text-slate-900">try one free chat</span> with
            no account, then <span className="font-semibold text-slate-900">sign up for a free membership</span> to keep going, and can
            upgrade to a paid plan for more chats.
          </p>

          <div className="grid gap-3">
            {TIERS.map((tier) => {
              const Icon = tier.icon;
              return (
                <div key={tier.name} className="flex items-start gap-4 rounded-xl border border-slate-200 p-4">
                  <div className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${tier.accent}`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-bold text-slate-900 text-sm">{tier.name}</p>
                      <span className="text-xs font-semibold text-slate-500">{tier.limit}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-semibold text-slate-500">{tier.price}</span>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed mt-1">{tier.how}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-sm font-bold text-blue-950 mb-1">What counts as one "chat"?</p>
            <p className="text-blue-900 text-sm leading-relaxed">
              A chat is one session — from when the student opens it until <span className="font-semibold">you mark it Resolved</span>.
              Weekly limits reset automatically at the start of each week (Monday). The one-time trial chat is a lifetime allowance,
              not weekly.
            </p>
          </div>
        </SectionCard>

        {/* 2. Who you'll deal with */}
        <SectionCard>
          <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Step 2</span>
          <h2 className="text-xl font-bold text-slate-900 mt-1 mb-4">Who you'll be dealing with</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <Sparkles size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-slate-600 text-sm leading-relaxed">
                <span className="font-semibold text-slate-900">Trial guests.</span> On their one free chat. They show up in the queue as
                "Student" with no membership. Their chat window shows a banner inviting them to sign up. Answer them well — this is your
                chance to convert them.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <Users size={18} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-slate-600 text-sm leading-relaxed">
                <span className="font-semibold text-slate-900">Free &amp; paid members.</span> Signed-up students. The queue shows each
                one's plan and how many weekly chats they have used / remaining.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-slate-700 mt-0.5 shrink-0" />
              <p className="text-slate-600 text-sm leading-relaxed">
                <span className="font-semibold text-slate-900">Advisors / admins.</span> You and your team. Only accounts on the admin
                list can open the dashboard and reply as an expert.
              </p>
            </li>
          </ul>
        </SectionCard>

        {/* 3. Daily procedure */}
        <SectionCard>
          <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Step 3</span>
          <h2 className="text-xl font-bold text-slate-900 mt-1 mb-2">Your day-to-day procedure</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">Everything below happens in the Advisor Dashboard.</p>

          <ol className="space-y-5">
            {DAILY_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{step.title}</p>
                  <p className="text-slate-600 text-sm leading-relaxed mt-0.5">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        {/* 4. Giving a member more chats */}
        <SectionCard>
          <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Step 4</span>
          <h2 className="text-xl font-bold text-slate-900 mt-1 mb-4">Giving a member extra chats this week</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">
            If a limited member (free or standard) needs one more chat before their weekly reset, you can grant it instantly from the
            dashboard — no technical steps required.
          </p>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Plus size={16} />
              </span>
              <span className="text-sm text-slate-700">adds one chat for this week</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
                <Minus size={16} />
              </span>
              <span className="text-sm text-slate-700">removes one chat for this week</span>
            </div>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed mt-3">
            The change applies only to the current week and does not affect unlimited members.
          </p>
        </SectionCard>

        {/* 5. Rules & good-to-know */}
        <SectionCard>
          <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Good to know</span>
          <h2 className="text-xl font-bold text-slate-900 mt-1 mb-4">Rules &amp; common questions</h2>
          <ul className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <span>You can only reply to a chat you have claimed. You can't reply to a chat another advisor has claimed.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <span>No-membership chats never show a "Needs reply" flag and sit at the bottom of the queue — prioritise members first.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <span>Once a chat is resolved it can't receive new messages. The student simply starts a new chat, which counts against their weekly total.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <span>Admin accounts and student accounts are separate. An admin account is treated as an advisor, not a subscriber — use a separate student account to test the member experience.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <span>Every advisor gets an email alert when a chat starts or a student writes in. Turn your own alerts on or off any time with the <span className="font-semibold">Email alerts</span> button at the top of the dashboard.</span>
            </li>
          </ul>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle size={16} className="text-amber-700" />
              <p className="text-sm font-bold text-amber-950">One-time setup for the free trial</p>
            </div>
            <p className="text-amber-900 text-sm leading-relaxed">
              The "try one free chat" flow relies on anonymous guest sessions. If trial chats aren't starting, a developer needs to turn
              on <span className="font-semibold">Anonymous sign-ins</span> in the Supabase dashboard (Authentication settings). It only
              has to be done once, and it's free.
            </p>
          </div>
        </SectionCard>

        <p className="text-center text-slate-400 text-xs pt-2">
          Keep this page handy — it's linked from the top of your Advisor Dashboard.
        </p>
      </div>
    </div>
  );
}
