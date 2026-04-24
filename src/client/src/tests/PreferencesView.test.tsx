import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreferencesView from '../views/PreferencesView';

const MOCK_PREFS = {
  location: 'Copenhagen',
  commutableLocations: 'Malmö',
  remote: ['hybrid'],
  seniority: 'senior',
  minSalaryDkk: 55000,
  techInterests: 'React, TypeScript',
  techAvoid: '',
  companyBlacklist: '',
  country: 'denmark',
  searchTerms: 'frontend developer',
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
    return Promise.resolve({ ok: true, json: async () => ({ parsed: '# Parsed Resume' }) });
  }));
});

describe('PreferencesView', () => {
  it('renders section headings', async () => {
    render(<PreferencesView />);
    await waitFor(() => {
      expect(screen.getByText('Job preferences')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });
  });

  it('loads preferences into form fields', async () => {
    render(<PreferencesView />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Copenhagen / Greater Copenhagen')).toHaveValue('Copenhagen');
      expect(screen.getByPlaceholderText('Malmö, Sweden')).toHaveValue('Malmö');
    });
  });

  it('loads resume text into textarea', async () => {
    render(<PreferencesView />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Resume' })).toHaveValue('# My Resume');
    });
  });

  it('Save buttons are disabled when content is unchanged', async () => {
    render(<PreferencesView />);
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      saveButtons.forEach(btn => expect(btn).toBeDisabled());
    });
  });

  it('enables resume Save button when resume changes', async () => {
    render(<PreferencesView />);
    await waitFor(() => screen.getByRole('textbox', { name: 'Resume' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resume' }), { target: { value: '# Updated' } });
    await waitFor(() => {
      const saveButtons = screen.getAllByRole('button', { name: 'Save' });
      expect(saveButtons.some(b => !b.hasAttribute('disabled'))).toBe(true);
    });
  });

  it('enables prefs Save button when a preference changes', async () => {
    render(<PreferencesView />);
    await waitFor(() => screen.getByPlaceholderText('Copenhagen / Greater Copenhagen'));
    fireEvent.change(screen.getByPlaceholderText('Copenhagen / Greater Copenhagen'), { target: { value: 'Aarhus' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect(saveButtons.some(b => !b.hasAttribute('disabled'))).toBe(true);
  });

  it('calls PUT /api/settings/resume on resume save', async () => {
    render(<PreferencesView />);
    await waitFor(() => screen.getByRole('textbox', { name: 'Resume' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Resume' }), { target: { value: '# New Resume' } });
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

  it('shows ingest section and Parse button', async () => {
    render(<PreferencesView />);
    await waitFor(() => {
      expect(screen.getByText('Ingest resume')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Parse with AI' })).toBeInTheDocument();
    });
  });

  it('shows parsed result after ingest and Use this button', async () => {
    render(<PreferencesView />);
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
