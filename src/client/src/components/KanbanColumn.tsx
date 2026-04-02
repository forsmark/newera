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

export default function KanbanColumn({
  title,
  column,
  color,
  cards,
  onDrop,
  onCardUpdate,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const jobId = e.dataTransfer.getData("text/plain");
    if (jobId) {
      onDrop(jobId, column);
    }
  }

  return (
    <div
      style={{
        flex: "0 0 280px",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.625rem 0.875rem",
          borderRadius: "0.5rem",
          background: "#1e293b",
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "0.9375rem",
            color: "#f1f5f9",
          }}
        >
          {title}
        </span>
        <span
          style={{
            background: "#0f172a",
            color: "#94a3b8",
            borderRadius: "9999px",
            padding: "0.1rem 0.5rem",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          minHeight: "120px",
          borderRadius: "0.5rem",
          padding: "0.5rem",
          background: dragOver ? "rgba(255,255,255,0.04)" : "transparent",
          border: dragOver ? `1px dashed ${color}` : "1px dashed transparent",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {cards.map((app) => (
          <KanbanCard key={app.job_id} application={app} onUpdate={onCardUpdate} />
        ))}

        {cards.length === 0 && !dragOver && (
          <div
            style={{
              textAlign: "center",
              color: "#475569",
              fontSize: "0.8125rem",
              padding: "2rem 0",
            }}
          >
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
