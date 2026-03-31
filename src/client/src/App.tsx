import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import JobsView from "./views/JobsView";
import KanbanView from "./views/KanbanView";

function Nav() {
  return (
    <nav style={{ display: "flex", gap: "1rem", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
      <strong style={{ marginRight: "auto" }}>New Era</strong>
      <NavLink to="/jobs">Jobs</NavLink>
      <NavLink to="/kanban">Kanban</NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/jobs" element={<JobsView />} />
        <Route path="/kanban" element={<KanbanView />} />
      </Routes>
    </BrowserRouter>
  );
}
