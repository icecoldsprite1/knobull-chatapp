const GUIDE_SCRIPT = {
  intro: "Hello! I'm the Knobull Guide. I'm here to help you navigate your career resources. What's on your mind today?",
  handoff: "Understood. I've notified the expert team. Someone will be with you shortly."
};

// Weekly chat-session caps per tier. A chat session (start -> advisor-resolved)
// counts as 1. `null` means uncapped.
const FREE_WEEKLY_SESSIONS = 2;
const STANDARD_WEEKLY_SESSIONS = 5;

// Lifetime free-trial cap for a not-yet-registered guest (anonymous auth user).
// A guest may try the service with exactly this many real chat sessions total,
// after which they must sign up for a free account to continue.
const TRIAL_TOTAL_SESSIONS = 1;

module.exports = {
  GUIDE_SCRIPT,
  FREE_WEEKLY_SESSIONS,
  STANDARD_WEEKLY_SESSIONS,
  TRIAL_TOTAL_SESSIONS,
};
