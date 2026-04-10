import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JobRow from '../components/JobRow';
import { makeJob } from './helpers';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAnimate: () => [{ current: null }, vi.fn()],
  useReducedMotion: () => false,
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('JobRow', () => {
  it('renders job title, company, and location', () => {
    render(
      <JobRow
        job={makeJob()}
        onStatusChange={vi.fn()}
      />
    );
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Copenhagen')).toBeInTheDocument();
  });

  it('shows animated dots when match_score is null', () => {
    render(<JobRow job={makeJob({ match_score: null })} onStatusChange={vi.fn()} />);
    expect(screen.getByText('···')).toBeInTheDocument();
  });

  it('shows score number when match_score is set', () => {
    render(<JobRow job={makeJob({ match_score: 85 })} onStatusChange={vi.fn()} />);
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('score badge has green class for score >= 80', () => {
    const { container } = render(<JobRow job={makeJob({ match_score: 82 })} onStatusChange={vi.fn()} />);
    const badge = container.querySelector('.bg-green-bg');
    expect(badge).toBeInTheDocument();
  });

  it('score badge has amber class for score 50–79', () => {
    const { container } = render(<JobRow job={makeJob({ match_score: 65 })} onStatusChange={vi.fn()} />);
    expect(container.querySelector('.bg-amber-bg')).toBeInTheDocument();
  });

  it('shows unseen dot when seen_at is null', () => {
    const { container } = render(<JobRow job={makeJob({ seen_at: null })} onStatusChange={vi.fn()} />);
    expect(container.querySelector('.bg-amber.rounded-full')).toBeInTheDocument();
  });

  it('does not show unseen dot when seen_at is set', () => {
    const { container } = render(
      <JobRow job={makeJob({ seen_at: '2026-04-05T10:00:00Z' })} onStatusChange={vi.fn()} />
    );
    expect(container.querySelector('.bg-amber.rounded-full')).not.toBeInTheDocument();
  });

  it('shows Save button for new jobs', () => {
    render(<JobRow job={makeJob({ status: 'new' })} onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows Applied and Discard buttons for new jobs', () => {
    render(<JobRow job={makeJob({ status: 'new' })} onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Applied/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('shows Saved toggle button for saved jobs', () => {
    render(<JobRow job={makeJob({ status: 'saved' })} onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();
  });

  it('calls onStatusChange with new when Saved is clicked (unsave)', async () => {
    const onStatusChange = vi.fn();
    render(<JobRow job={makeJob({ status: 'saved' })} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('job-1', 'new'));
  });

  it('calls onStatusChange when Save is clicked', async () => {
    const onStatusChange = vi.fn();
    render(<JobRow job={makeJob({ status: 'new' })} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('job-1', 'saved'));
  });

  it('calls onStatusChange with rejected when Discard is clicked', async () => {
    const onStatusChange = vi.fn();
    render(<JobRow job={makeJob({ status: 'new' })} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('job-1', 'rejected'));
  });

  it('reduces opacity for low-scoring jobs', () => {
    const { container } = render(<JobRow job={makeJob({ match_score: 30 })} onStatusChange={vi.fn()} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.6');
  });

  it('expands to show JobDetail when row is clicked', () => {
    render(<JobRow job={makeJob()} onStatusChange={vi.fn()} />);
    // JobDetail shows "Fit Analysis" section when match_reasoning is set
    expect(screen.queryByText('Fit Analysis')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Frontend Developer'));
    expect(screen.getByText('Fit Analysis')).toBeInTheDocument();
  });

  it('shows Link dead badge when link_status is expired', () => {
    render(<JobRow job={makeJob({ link_status: 'expired' })} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Frontend Developer'));
    expect(screen.getByText('Link dead')).toBeInTheDocument();
  });
});
