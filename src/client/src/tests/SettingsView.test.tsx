import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsView from '../views/SettingsView';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resume: '', preferences: {} }),
      });
    }
    if (url === '/api/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ollama_available: true, unscored_jobs: 3 }),
      });
    }
    if (url === '/api/backups') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ backups: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ queued: 5 }) });
  }));
});

describe('SettingsView', () => {
  it('renders system section headings', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('App config')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('shows Ollama Connected when ollama_available is true', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByText('System'));
    fireEvent.click(screen.getByText('System'));
    await waitFor(() => {
      expect(screen.getByText('Ollama Connected')).toBeInTheDocument();
    });
  });

  it('shows unscored jobs count', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByText('System'));
    fireEvent.click(screen.getByText('System'));
    await waitFor(() => {
      expect(screen.getByText('3 jobs pending LLM analysis')).toBeInTheDocument();
    });
  });

  it('calls POST /api/settings/rescore when Re-score button clicked', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByText('System'));
    fireEvent.click(screen.getByText('System'));
    await waitFor(() => screen.getByRole('button', { name: 'Re-score all jobs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-score all jobs' }));
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const call = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/rescore' && (opts as RequestInit)?.method === 'POST'
      );
      expect(call).toBeDefined();
    });
  });
});
