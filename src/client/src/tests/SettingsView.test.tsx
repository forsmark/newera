import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsView from '../views/SettingsView';

const MOCK_PREFS = {
  location: 'Copenhagen',
  commutableLocations: 'Malmö',
  remote: 'hybrid',
  seniority: 'senior',
  minSalaryDkk: 55000,
  techInterests: 'React, TypeScript',
  techAvoid: '',
  companyBlacklist: '',
  linkedinSearchTerms: 'frontend developer',
  jobindexSearchTerms: 'frontend udvikler',
  notes: '',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resume: '# My Resume', preferences: MOCK_PREFS }),
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
    return Promise.resolve({ ok: true, json: async () => ({ queued: 5, parsed: '# Parsed Resume' }) });
  }));
});

describe('SettingsView', () => {
  it('renders section headings', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Job preferences')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('loads preferences into form fields', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Copenhagen / Greater Copenhagen')).toHaveValue('Copenhagen');
      expect(screen.getByPlaceholderText('Malmö, Sweden')).toHaveValue('Malmö');
    });
  });

  it('loads resume text into textarea', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Resume' })).toHaveValue('# My Resume');
    });
  });

  it('Save buttons are disabled when content is unchanged', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      saveButtons.forEach(btn => expect(btn).toBeDisabled());
    });
  });

  it('enables resume Save button when resume changes', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByRole('textbox', { name: 'Resume' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resume' }), { target: { value: '# Updated' } });
    await waitFor(() => {
      // Find a Save button that is not disabled (the resume one)
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons.some(b => !b.hasAttribute('disabled'))).toBe(true);
    });
  });

  it('enables prefs Save button when a preference changes', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByPlaceholderText('Copenhagen / Greater Copenhagen'));
    fireEvent.change(screen.getByPlaceholderText('Copenhagen / Greater Copenhagen'), { target: { value: 'Aarhus' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect(saveButtons.some(b => !b.hasAttribute('disabled'))).toBe(true);
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

  it('calls PUT /api/settings/resume on resume save', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByRole('textbox', { name: 'Resume' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resume' }), { target: { value: '# New Resume' } });
    // Click the Save button that just became enabled
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    const enabledSave = saveButtons.find(b => !b.hasAttribute('disabled'));
    fireEvent.click(enabledSave!);
    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/settings/resume' && (opts as RequestInit)?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
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

  it('shows ingest section and Parse button', async () => {
    render(<SettingsView />);
    await waitFor(() => {
      expect(screen.getByText('Ingest resume')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Parse with AI' })).toBeInTheDocument();
    });
  });

  it('shows parsed result after ingest and Use this button', async () => {
    render(<SettingsView />);
    await waitFor(() => screen.getByPlaceholderText(/Paste raw CV text/));
    fireEvent.change(screen.getByPlaceholderText(/Paste raw CV text/), {
      target: { value: 'John Doe, Software Engineer with 10 years of experience in React and TypeScript. Worked at Google, Meta, Stripe.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse with AI' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Use this' })).toBeInTheDocument();
      expect(screen.getByText('# Parsed Resume')).toBeInTheDocument();
    });
  });
});
