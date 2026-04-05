import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KanbanCard from '../components/KanbanCard';
import { makeApplication } from './helpers';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeApplication() }));
});

describe('KanbanCard', () => {
  it('renders job title and company', () => {
    render(<KanbanCard application={makeApplication()} onUpdate={vi.fn()} />);
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('shows "…" when match_score is null', () => {
    render(
      <KanbanCard application={makeApplication({ job: { ...makeApplication().job, match_score: null } })} onUpdate={vi.fn()} />
    );
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('shows numeric score when set', () => {
    render(<KanbanCard application={makeApplication()} onUpdate={vi.fn()} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('shows job location', () => {
    render(<KanbanCard application={makeApplication()} onUpdate={vi.fn()} />);
    expect(screen.getByText('Copenhagen')).toBeInTheDocument();
  });

  it('shows notes preview when notes are set', () => {
    render(
      <KanbanCard application={makeApplication({ notes: 'Great culture fit.' })} onUpdate={vi.fn()} />
    );
    expect(screen.getByText('Great culture fit.')).toBeInTheDocument();
  });

  it('shows interview date when set', () => {
    render(
      <KanbanCard application={makeApplication({ interview_at: '2026-04-20T14:00:00Z' })} onUpdate={vi.fn()} />
    );
    expect(screen.getByText(/Interview:/)).toBeInTheDocument();
    expect(screen.getByText(/20 Apr 2026/)).toBeInTheDocument();
  });

  it('shows Edit button', () => {
    render(<KanbanCard application={makeApplication()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('clicking Edit reveals notes textarea and date input', () => {
    render(<KanbanCard application={makeApplication()} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByPlaceholderText('Notes…')).toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('clicking Cancel restores original state', () => {
    render(<KanbanCard application={makeApplication({ notes: 'Original note' })} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByPlaceholderText('Notes…');
    fireEvent.change(textarea, { target: { value: 'Changed note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Original note')).toBeInTheDocument();
  });

  it('pre-populates textarea with existing notes in edit mode', () => {
    render(<KanbanCard application={makeApplication({ notes: 'Existing note.' })} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByDisplayValue('Existing note.')).toBeInTheDocument();
  });
});
