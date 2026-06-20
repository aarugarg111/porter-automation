import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import BookConfirm from './BookConfirm';
import * as api from '../api';
import type { LocationRow } from '../api';

vi.mock('../api', () => ({
  createIntent: vi.fn(),
}));

const customerLocation: LocationRow = {
  id: 5,
  nickname: 'Raj Store',
  relationship: 'customer',
  default_direction: 'SEND',
  default_payer: 'ME',
};

const supplierLocation: LocationRow = {
  id: 6,
  nickname: 'Supplier Co',
  relationship: 'supplier',
  default_direction: 'RECEIVE',
  default_payer: 'RECEIVER',
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('customer location defaults direction to SEND', () => {
  render(<BookConfirm location={customerLocation} onBack={() => {}} onDone={() => {}} />);
  const dirSelect = screen.getByLabelText(/direction/i) as HTMLSelectElement;
  expect(dirSelect.value).toBe('SEND');
});

test('supplier location defaults direction to RECEIVE', () => {
  render(<BookConfirm location={supplierLocation} onBack={() => {}} onDone={() => {}} />);
  const dirSelect = screen.getByLabelText(/direction/i) as HTMLSelectElement;
  expect(dirSelect.value).toBe('RECEIVE');
});

test('Confirm button calls createIntent with the right body', async () => {
  const mockCreate = vi.mocked(api.createIntent).mockResolvedValue({ id: 42 });
  const onDone = vi.fn();

  render(<BookConfirm location={customerLocation} onBack={() => {}} onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

  await waitFor(() => {
    expect(mockCreate).toHaveBeenCalledWith({
      direction: 'SEND',
      otherLocationId: 5,
      payer: 'ME',
    });
  });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(42));
});
