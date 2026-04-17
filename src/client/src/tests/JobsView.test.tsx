import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JobsView from '../views/JobsView';
import { makeJob } from './helpers';
import type { AppStatus } from '../types';

function renderView(props: Parameters<typeof JobsView>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><JobsView {...props} /></MemoryRouter>
    </QueryClientProvider>
  );
}

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
  useAnimate: () => [{ current: null }, vi.fn()],
}));

let triggerSentinel: ((visible: boolean) => void) | null = null;

// jsdom has no IntersectionObserver; expose a trigger for tests
beforeEach(() => {
  triggerSentinel = null;
  vi.stubGlobal('IntersectionObserver', class {
    cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
    observe() {
      triggerSentinel = (visible) => {
        this.cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      };
    }
    disconnect() {}
  });
});

function makeStatus(overrides: Partial<AppStatus> = {}): AppStatus {
  return {
    last_fetch_at: null,
    counts: [],
    score_distribution: { green: 0, amber: 0, grey: 0, pending: 0 },
    ...overrides,
  };
}

function mockFetch(jobs = [makeJob()], total = 1) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobs, total }),
  }));
}

function makeJobs(n: number, startId = 1): ReturnType<typeof makeJob>[] {
  return Array.from({ length: n }, (_, i) =>
    makeJob({ id: `job-${startId + i}`, title: `Job ${startId + i}` })
  );
}

describe('JobsView infinite scroll', () => {
  it('fetches next page when sentinel becomes visible and more jobs exist', async () => {
    const page1 = makeJobs(2, 1);
    const page2 = makeJobs(1, 3);
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      callCount++;
      if (url.includes('offset=0')) {
        return { ok: true, json: async () => ({ jobs: page1, total: 3 }) };
      }
      if (url.includes('offset=2')) {
        return { ok: true, json: async () => ({ jobs: page2, total: 3 }) };
      }
      return { ok: true, json: async () => ({ jobs: [], total: 3 }) };
    }));

    renderView({ status: makeStatus() });

    await waitFor(() => screen.getByText('Job 1'));

    // Trigger infinite scroll sentinel
    await act(async () => { triggerSentinel?.(true); });

    await waitFor(() => {
      expect(screen.getByText('Job 3')).toBeInTheDocument();
    });
  });
});

describe('JobsView scoring indicator', () => {
  it('shows scoring indicator when status.score_distribution.pending > 0, even if all loaded jobs are scored', async () => {
    mockFetch([makeJob({ match_score: 85 }), makeJob({ id: 'job-2', match_score: 72 })], 2);
    const status = makeStatus({ score_distribution: { green: 2, amber: 0, grey: 0, pending: 5 } });

    renderView({ status });

    await waitFor(() => {
      expect(screen.getByText(/Scoring 5 jobs/)).toBeInTheDocument();
    });
  });

  it('hides scoring indicator when status.score_distribution.pending is 0', async () => {
    mockFetch([makeJob({ match_score: null })], 1);
    const status = makeStatus({ score_distribution: { green: 0, amber: 0, grey: 0, pending: 0 } });

    renderView({ status });

    await waitFor(() => screen.getByText('Frontend Developer'));
    expect(screen.queryByText(/Scoring/)).not.toBeInTheDocument();
  });
});
