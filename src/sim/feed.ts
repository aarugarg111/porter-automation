// src/sim/feed.ts
export async function feedSequence(baseUrl: string, _deliveryId: number, samples: string[]): Promise<void> {
  for (const text of samples) {
    await fetch(`${baseUrl}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }
}
