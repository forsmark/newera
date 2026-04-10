import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JobDetail from '../components/JobDetail';
import { makeJob } from './helpers';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('JobDetail', () => {
  it('shows "Analysis pending…" when match_score is null', () => {
    render(<JobDetail job={makeJob({ match_score: null, match_reasoning: null, match_summary: null })} />);
    expect(screen.getByText('Analysis pending…')).toBeInTheDocument();
  });

  it('shows Role Summary section when match_summary is present', () => {
    render(<JobDetail job={makeJob()} />);
    expect(screen.getByText('Role Summary')).toBeInTheDocument();
    expect(screen.getByText('This role builds React components for a fintech app.')).toBeInTheDocument();
  });

  it('shows Fit Analysis section when match_reasoning is present', () => {
    render(<JobDetail job={makeJob()} />);
    expect(screen.getByText('Fit Analysis')).toBeInTheDocument();
    expect(screen.getByText('Strong React skills match the requirements.')).toBeInTheDocument();
  });

  it('shows tech stack tags', () => {
    render(<JobDetail job={makeJob({ tags: ['React', 'TypeScript'] })} />);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('does not show tags section when tags are empty', () => {
    const { container } = render(<JobDetail job={makeJob({ tags: [] })} />);
    expect(container.querySelectorAll('.bg-bg.border').length).toBe(0);
  });

  it('shows Re-score and Copy buttons', () => {
    render(<JobDetail job={makeJob()} />);
    expect(screen.getByRole('button', { name: /Re-score/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('calls onRescore when Re-score is clicked', async () => {
    const onRescore = vi.fn();
    render(<JobDetail job={makeJob()} onRescore={onRescore} />);
    fireEvent.click(screen.getByRole('button', { name: /Re-score/ }));
    await vi.waitFor(() => expect(onRescore).toHaveBeenCalledWith('job-1'));
  });
});
