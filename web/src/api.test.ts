import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import { listDeliveries, getDelivery, listLocations, createIntent, getLedger } from './api';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeJsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

test('listDeliveries calls /api/deliveries and returns parsed array', async () => {
  const deliveries = [
    { id: 1, status: 'ASSIGNED', direction: 'SEND', late: false },
    { id: 2, status: 'PICKED_UP', direction: 'RECEIVE', late: true },
  ];
  mockFetch.mockReturnValueOnce(makeJsonResponse(deliveries));

  const result = await listDeliveries();
  expect(mockFetch).toHaveBeenCalledWith('/api/deliveries');
  expect(result).toEqual(deliveries);
});

test('getDelivery calls /api/deliveries/:id and returns delivery with events', async () => {
  const delivery = { id: 42, status: 'PICKED_UP', events: [{ id: 1, event_type: 'status' }] };
  mockFetch.mockReturnValueOnce(makeJsonResponse(delivery));

  const result = await getDelivery(42);
  expect(mockFetch).toHaveBeenCalledWith('/api/deliveries/42');
  expect(result).toEqual(delivery);
});

test('listLocations calls /api/locations and returns parsed array', async () => {
  const locations = [{ id: 1, nickname: 'Home', relationship: 'both' }];
  mockFetch.mockReturnValueOnce(makeJsonResponse(locations));

  const result = await listLocations();
  expect(mockFetch).toHaveBeenCalledWith('/api/locations');
  expect(result).toEqual(locations);
});

test('createIntent POSTs to /api/intent and returns { id }', async () => {
  mockFetch.mockReturnValueOnce(makeJsonResponse({ id: 7 }));

  const result = await createIntent({ direction: 'SEND', otherLocationId: 3 });
  expect(mockFetch).toHaveBeenCalledWith('/api/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: 'SEND', otherLocationId: 3 }),
  });
  expect(result).toEqual({ id: 7 });
});

test('getLedger calls /api/ledger and returns rows + totals', async () => {
  const ledger = { rows: [], totals: { count: 0, pending: 0, settled: 0 } };
  mockFetch.mockReturnValueOnce(makeJsonResponse(ledger));

  const result = await getLedger();
  expect(mockFetch).toHaveBeenCalledWith('/api/ledger');
  expect(result).toEqual(ledger);
});
