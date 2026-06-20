import { render, screen } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import App from './App';

vi.mock('./api', () => ({
  listLocations: vi.fn().mockResolvedValue([]),
  listDeliveries: vi.fn().mockResolvedValue([]),
  getDelivery: vi.fn(),
  createIntent: vi.fn(),
  getLedger: vi.fn(),
}));

test('renders Porter Cockpit heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /porter cockpit/i })).toBeInTheDocument();
});
