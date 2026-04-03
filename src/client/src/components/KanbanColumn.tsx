import { useState } from "react";
import type { Application } from "../types";
import KanbanCard from "./KanbanCard";

interface Props {
  title: string;
  column: Application['kanban_column'];
  color: string;
  cards: Application[];
  onDrop: (jobId: string, column: Application['kanban_column']) => void;
  onCardUpdate: (updated: Application) => void;
}

export default function KanbanColumn({ title, column, color, cards, onDrop, onCardUpdate }: Props) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const jobId = e.dataTransfer.getData("text/plain");
    if (jobId) onDrop(jobId, column);
  }

  return (
    <div style={{ flex: "0 0 272px", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.5625rem 0.875rem",
        borderRadius: "var(--radius-sm)",
        background: "#0b1628",
        border: "1px solid #1a2840",
        borderLeft: `3px solid ${color}`,
      }}>
        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#dde6f0" }}>{title}</span>
        <span style={{
          background: "#030b17", color: "#405a74", borderRadius: "9999px",
          padding: "0.0625rem 0.4375rem", fontSize: "0.6875rem", fontWeight: 600,
        }}>
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: "flex", flexDirection: "column", gap: "0.375rem",
          minHeight: "120px", borderRadius: "var(--radius-sm)", padding: "0.25rem",
          background: dragOver ? "rgba(59,130,246,0.04)" : "transparent",
          border: dragOver ? `1px dashed ${color}40` : "1px dashed transparent",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {cards.map(app => (
          <KanbanCard key={app.job_id} application={app} onUpdate={onCardUpdate} columnColor={color} />
        ))}
        {cards.length === 0 && !dragOver && (
          <div style={{ textAlign: "center", color: "#1a2840", fontSize: "0.8125rem", padding: "2.5rem 0", userSelect: "none" }}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
