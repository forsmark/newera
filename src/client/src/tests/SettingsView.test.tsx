import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsView from '../views/SettingsView';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resume: '# My Resume', preferences: '## Preferences' }),
      });
    }
    if (url === '/api/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ollama_available: true, unscored_jobs: 3 }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }));
});

describe('SettingsView', () => {
  it('renders section headings', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('loads resume content into the first textarea', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas[0]).toHaveValue('# My Resume');
    });
  });

  it('loads preferences content into the second textarea', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      expect(textareas[1]).toHaveValue('## Preferences');
    });
  });

  it('Save buttons are disabled when content is unchanged', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons[0]).toBeDisabled();
      expect(saveButtons[1]).toBeDisabled();
    });
  });

  it('enables resume Save button when content changes', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getAllByRole('textbox')[0]);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '# Updated' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect(saveButtons[0]).not.toBeDisabled();
    expect(saveButtons[1]).toBeDisabled(); // preferences unchanged
  });

  it('shows Ollama Connected when ollama_available is true', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Ollama Connected')).toBeInTheDocument();
    });
  });

  it('shows unscored jobs count', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('3 jobs pending LLM analysis')).toBeInTheDocument();
    });
  });

  it('shows Re-score all jobs button', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Re-score all jobs' })).toBeInTheDocument();
    });
  });

  it('calls PUT /api/settings/resume on resume save', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getAllByRole('textbox')[0]);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '# New Resume' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/resume' && (opts as RequestInit)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.content).toBe('# New Resume');
    });
    // After the PUT call resolves, the save should reset dirty state → button disabled
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
    });
  });

  it('calls POST /api/settings/rescore when Re-score button clicked', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByRole('button', { name: 'Re-score all jobs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-score all jobs' }));
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const rescoreCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/rescore' && (opts as RequestInit)?.method === 'POST'
      );
      expect(rescoreCall).toBeDefined();
    });
  });
});
