import React from 'react';
import { Library, User, ShieldCheck } from 'lucide-react';

/**
 * ChatBubble Component
 * 
 * Reusable UI component that renders a single message in the chat thread.
 * Automatically aligns and styles itself based on who sent the message.
 * 
 * @param {Object} props.message - The database message object containing `content` and `sender_type`.
 * @param {string} props.viewerRole - The current viewer role. Used to label "You" correctly.
 */
export default function ChatBubble({ message, viewerRole = 'student' }) {
  // Determine styling context
  const isStudent = message.sender_type === 'student';
  const isExpert = message.sender_type === 'expert';
  const isGuide = message.sender_type === 'guide';
  const isMine = message.sender_type === viewerRole;

  const time = message.created_at 
    ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    : '';

  return (
    <div className={`flex items-start gap-3 w-full ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      
      {/* Avatar Icon */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 shadow-sm ${
        isMine ? 'bg-blue-100 text-blue-700' :
        isExpert ? 'bg-slate-800 text-white shadow-slate-900/20' :
        isStudent ? 'bg-white border border-blue-200 text-blue-700' : 'bg-slate-100 border border-slate-200 text-slate-600'
      }`}>
        {isStudent ? <User size={16} /> : isExpert ? <ShieldCheck size={16} /> : <Library size={16} />}
      </div>

      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[80%]`}>
        
        {/* Name Label & Timestamp */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[11px] font-bold tracking-wide uppercase text-slate-500">
            {isMine ? 'You' : isGuide ? 'Knobull Support' : isExpert ? 'Academic Advisor' : 'Student'}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">{time}</span>
        </div>

        {/* Text Bubble Content */}
        <div className={`px-4 py-3 text-sm leading-relaxed ${
          isMine 
            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-sm' 
            : isExpert 
            ? 'bg-white border border-blue-200 text-slate-800 rounded-2xl rounded-tl-sm shadow-sm' 
            : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm shadow-sm'
        }`}>
          {/* whitespace-pre-wrap ensures multi-line messages render correctly */}
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
