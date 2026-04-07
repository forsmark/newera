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
    <div className="flex-[0_0_284px] flex flex-col gap-2.5 self-stretch">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded bg-surface border border-border"
        style={{ borderLeftWidth: "3px", borderLeftColor: color }}
      >
        <span className="font-semibold text-sm text-text">{title}</span>
        <span className="bg-bg text-text-3 rounded-full px-[0.4375rem] py-[0.0625rem] text-[0.6875rem] font-semibold">
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex flex-col gap-2 flex-1 rounded p-1 transition-[background,border-color] duration-150"
        style={{
          background: dragOver ? "rgba(59,130,246,0.04)" : "transparent",
          border: dragOver ? `1px dashed ${color}40` : "1px dashed transparent",
        }}
      >
        {cards.map(app => (
          <KanbanCard key={app.job_id} application={app} onUpdate={onCardUpdate} columnColor={color} />
        ))}
        {cards.length === 0 && !dragOver && (
          <div className="text-center text-border text-[0.8125rem] py-10 select-none">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
