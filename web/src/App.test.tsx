import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Porter Cockpit heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /porter cockpit/i })).toBeInTheDocument();
});
