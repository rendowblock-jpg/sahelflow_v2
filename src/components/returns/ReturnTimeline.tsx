"use client";

import { User, FileText, Settings, HelpCircle, CheckCircle, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ReturnNote } from "@/types";

interface ReturnTimelineProps {
  notes: ReturnNote[];
}

export default function ReturnTimeline({ notes }: ReturnTimelineProps) {
  const { t } = useI18n();

  const getMarkerIcon = (type: ReturnNote["type"], content: string) => {
    const isSuccess = content.includes("approved") || content.includes("delivered") || content.includes("refunded") || content.includes("exchanged") || content.includes("نجاح");
    const isError = content.includes("rejected") || content.includes("cancelled") || content.includes("denied") || content.includes("رفض");

    switch (type) {
      case "system":
        if (isSuccess) return <CheckCircle size={10} className="sf-text-success" />;
        if (isError) return <XCircle size={10} className="sf-text-danger" />;
        return <Settings size={10} className="sf-text-brand" />;
      case "status_change":
        return <CheckCircle size={10} className="sf-text-success" />;
      case "note":
        return <FileText size={10} className="sf-text-warning" />;
      case "customer":
        return <User size={10} style={{ color: "#8b5cf6" }} />;
      default:
        return <HelpCircle size={10} className="sf-text-tertiary" />;
    }
  };

  const getTimelineTitle = (note: ReturnNote) => {
    // If it is status change or system, localized title or raw text
    switch (note.type) {
      case "system":
        return t.common.myStore || "System";
      case "status_change":
        return "Status Update";
      case "note":
        return "Seller Note";
      case "customer":
        return "Customer Message";
      default:
        return "Update";
    }
  };

  if (!notes || notes.length === 0) {
    return (
      <div className="sf-text-center sf-py-md sf-text-tertiary sf-text-sm">
        {t.common.noResults || "No history timeline logs available."}
      </div>
    );
  }

  return (
    <div className="sf-return-timeline">
      {notes.map((note) => (
        <div key={note.id} className="sf-return-timeline-item">
          <div className={`sf-return-timeline-marker is-${note.type}`}>
            {getMarkerIcon(note.type, note.content)}
          </div>
          <div className="sf-return-timeline-content">
            <div className="sf-return-timeline-header">
              <span className="sf-return-timeline-title">
                {getTimelineTitle(note)}
              </span>
              <span className="sf-return-timeline-time">
                {new Date(note.created_at).toLocaleString()}
              </span>
            </div>
            <p className="sf-return-timeline-text">{note.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
