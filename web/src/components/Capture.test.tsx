import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import Capture from './Capture';
import * as api from '../api';

vi.mock('../api', () => ({
  postCapture: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('an example chip fills the textarea', () => {
  render(<Capture onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /driver assigned/i }));
  const box = screen.getByLabelText(/notification text/i) as HTMLTextAreaElement;
  expect(box.value).toMatch(/assigned/i);
});

test('submitting calls postCapture (trimmed) and shows the matched banner', async () => {
  vi.mocked(api.postCapture).mockResolvedValue({ ok: true, matched: true, deliveryId: 9 });
  render(<Capture onBack={() => {}} />);

  fireEvent.change(screen.getByLabelText(/notification text/i), {
    target: { value: '  Your order PRTR1 has been delivered  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /read & update/i }));

  await waitFor(() =>
    expect(api.postCapture).toHaveBeenCalledWith('Your order PRTR1 has been delivered', undefined),
  );
  await waitFor(() => expect(screen.getByText(/updated delivery #9/i)).toBeInTheDocument());
});

test('an unparsed result shows the tuning hint', async () => {
  vi.mocked(api.postCapture).mockResolvedValue({ ok: true, matched: false, reason: 'unparsed' });
  render(<Capture onBack={() => {}} />);

  fireEvent.change(screen.getByLabelText(/notification text/i), { target: { value: 'random text' } });
  fireEvent.click(screen.getByRole('button', { name: /read & update/i }));

  await waitFor(() => expect(screen.getByText(/couldn't read this wording/i)).toBeInTheDocument());
});

test('the token entered in settings is persisted and sent', async () => {
  vi.mocked(api.postCapture).mockResolvedValue({ ok: true, matched: true, deliveryId: 1 });
  render(<Capture onBack={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  fireEvent.change(screen.getByLabelText(/capture token/i), { target: { value: 'tok123' } });
  expect(localStorage.getItem('porter.captureToken')).toBe('tok123');

  fireEvent.change(screen.getByLabelText(/notification text/i), { target: { value: 'delivered' } });
  fireEvent.click(screen.getByRole('button', { name: /read & update/i }));
  await waitFor(() => expect(api.postCapture).toHaveBeenCalledWith('delivered', 'tok123'));
});
