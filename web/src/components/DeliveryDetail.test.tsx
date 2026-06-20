import { render, screen, waitFor } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import DeliveryDetail from './DeliveryDetail';
import * as api from '../api';

vi.mock('../api', () => ({ getDelivery: vi.fn() }));

test('renders only status events in order, plus the ₹ amount', async () => {
  vi.mocked(api.getDelivery).mockResolvedValue({
    id: 7,
    status: 'DELIVERED',
    direction: 'SEND',
    other_location_id: 5,
    payer: 'ME',
    amount: 14800,
    payment_method: 'CASH',
    payment_status: 'settled',
    late: false,
    created_at: 'x',
    events: [
      { id: 1, delivery_id: 7, event_type: 'status', status: 'ASSIGNED', created_at: '2026-06-20T10:00:00Z' },
      { id: 2, delivery_id: 7, event_type: 'receipt', status: 'RECEIPT', created_at: '2026-06-20T10:05:00Z' },
      { id: 3, delivery_id: 7, event_type: 'status', status: 'DELIVERED', created_at: '2026-06-20T10:10:00Z' },
    ],
  } as any);

  render(<DeliveryDetail id={7} onBack={() => {}} />);
  await waitFor(() => screen.getByText(/Timeline/i));

  const items = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(items.length).toBe(2); // receipt event filtered out
  expect(items[0]).toMatch(/ASSIGNED/);
  expect(items[1]).toMatch(/DELIVERED/);
  expect(screen.getByText(/₹148/)).toBeTruthy();
});
