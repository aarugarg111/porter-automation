import { render, screen } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import ActiveList from './ActiveList';
import type { Delivery } from '../api';

vi.mock('../api', () => ({
  listDeliveries: vi.fn(),
}));

const deliveries: Delivery[] = [
  {
    id: 1,
    status: 'ASSIGNED',
    direction: 'SEND',
    other_location_id: 10,
    payer: 'ME',
    amount: 15000,
    payment_method: 'CASH',
    payment_status: 'PENDING',
    late: false,
    created_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 2,
    status: 'PICKED_UP',
    direction: 'RECEIVE',
    other_location_id: 11,
    payer: 'RECEIVER',
    amount: 8000,
    payment_method: 'UPI',
    payment_status: 'PENDING',
    late: true,
    created_at: '2026-06-20T09:00:00Z',
  },
];

test('ActiveList renders a row per delivery', () => {
  render(<ActiveList deliveries={deliveries} onSelect={() => {}} />);
  expect(screen.getByText('ASSIGNED')).toBeInTheDocument();
  expect(screen.getByText('PICKED_UP')).toBeInTheDocument();
});

test('ActiveList shows warning icon when late is true', () => {
  render(<ActiveList deliveries={deliveries} onSelect={() => {}} />);
  // delivery id=2 has late:true → should show ⚠
  const warnings = screen.getAllByText('⚠');
  expect(warnings.length).toBeGreaterThanOrEqual(1);
});

test('ActiveList shows direction arrows', () => {
  render(<ActiveList deliveries={deliveries} onSelect={() => {}} />);
  expect(screen.getByText('→')).toBeInTheDocument(); // SEND
  expect(screen.getByText('←')).toBeInTheDocument(); // RECEIVE
});

test('ActiveList shows amount in rupees', () => {
  render(<ActiveList deliveries={deliveries} onSelect={() => {}} />);
  expect(screen.getByText('₹150')).toBeInTheDocument();
  expect(screen.getByText('₹80')).toBeInTheDocument();
});
