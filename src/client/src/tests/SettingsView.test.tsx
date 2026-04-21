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
        json: async () => ({ llm_available: true, unscored_jobs: 3 }),
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
      expect(screen.getByText('Sources')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('renders Sources accordion', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Sources')).toBeInTheDocument();
    });
  });

  it('all source checkboxes are checked by default when disabledSources is empty', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByText('Sources'));
    fireEvent.click(screen.getByText('Sources'));
    await waitFor(() => {
      expect(screen.getByLabelText('LinkedIn')).toBeChecked();
      expect(screen.getByLabelText('Jobindex')).toBeChecked();
      expect(screen.getByLabelText('Remotive')).toBeChecked();
      expect(screen.getByLabelText('Arbeitnow')).toBeChecked();
      expect(screen.getByLabelText('RemoteOK')).toBeChecked();
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

  it('renders LLM Provider accordion', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('LLM Provider')).toBeInTheDocument();
    });
  });

  it('shows LM Studio Connected when llmProvider is lmstudio', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/settings') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ resume: '', preferences: { llmProvider: 'lmstudio' } }),
        });
      }
      if (url === '/api/status') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ llm_available: true, unscored_jobs: 0 }),
        });
      }
      if (url === '/api/backups') {
        return Promise.resolve({ ok: true, json: async () => ({ backups: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    render(<SettingsView />);
    await waitFor(() => screen.getByText('System'));
    fireEvent.click(screen.getByText('System'));
    await waitFor(() => {
      expect(screen.getByText('LM Studio Connected')).toBeInTheDocument();
    });
  });

  it('opens help modal when ? button is clicked', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByText('LLM Provider'));
    fireEvent.click(screen.getByText('LLM Provider'));
    await waitFor(() => screen.getByTitle('Setup guide'));
    fireEvent.click(screen.getByTitle('Setup guide'));
    await waitFor(() => {
      expect(screen.getByText('Ollama Setup Guide')).toBeInTheDocument();
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
