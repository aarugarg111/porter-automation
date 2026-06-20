import { render, screen, waitFor } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import Ledger from './Ledger';
import * as api from '../api';

vi.mock('../api', () => ({ getLedger: vi.fn() }));

test('renders totals.pending and a row per ledger row', async () => {
  vi.mocked(api.getLedger).mockResolvedValue({
    rows: [
      { id: 1, payer: 'ME', payment_method: 'CASH', payment_status: 'pending', amount: 10000 },
      { id: 2, payer: 'RECEIVER', payment_method: 'UPI', payment_status: 'settled', amount: 20000 },
    ],
    totals: { count: 2, pending: 10000, settled: 20000 },
  });

  render(<Ledger onBack={() => {}} />);
  await waitFor(() => screen.getByText(/Payment Ledger/i));

  expect(screen.getByText(/Pending:/).textContent).toMatch(/₹100/);
  // header row + 2 data rows
  expect(screen.getAllByRole('row').length).toBe(3);
});
