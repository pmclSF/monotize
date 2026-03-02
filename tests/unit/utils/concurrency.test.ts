import { describe, it, expect } from 'vitest';
import { pMap } from '../../../src/utils/concurrency.js';

describe('pMap', () => {
  it('should map items through an async function', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await pMap(items, async (item) => item * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should respect concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const concurrency = 2;

    const items = [1, 2, 3, 4, 5, 6];
    await pMap(
      items,
      async (item) => {
        running++;
        if (running > maxRunning) {
          maxRunning = running;
        }
        // Simulate async work to allow concurrency to be observed
        await new Promise((resolve) => setTimeout(resolve, 20));
        running--;
        return item;
      },
      concurrency,
    );

    expect(maxRunning).toBeLessThanOrEqual(concurrency);
    expect(maxRunning).toBeGreaterThan(0);
  });

  it('should propagate errors', async () => {
    const items = [1, 2, 3];
    await expect(
      pMap(items, async (item) => {
        if (item === 2) throw new Error('fail on 2');
        return item;
      }),
    ).rejects.toThrow('fail on 2');
  });

  it('should handle empty array', async () => {
    const results = await pMap([], async (item: number) => item * 2);
    expect(results).toEqual([]);
  });

  it('should handle single item', async () => {
    const results = await pMap([42], async (item) => item + 1);
    expect(results).toEqual([43]);
  });

  it('should preserve order of results', async () => {
    const items = [5, 4, 3, 2, 1];
    const results = await pMap(
      items,
      async (item) => {
        // Items with smaller values finish faster, but order should be preserved
        await new Promise((resolve) => setTimeout(resolve, item * 5));
        return item * 10;
      },
      3,
    );
    expect(results).toEqual([50, 40, 30, 20, 10]);
  });

  it('should pass correct index to callback', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];
    await pMap(items, async (_item, index) => {
      indices.push(index);
      return index;
    });
    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  it('should default concurrency to 4', async () => {
    let running = 0;
    let maxRunning = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await pMap(items, async (item) => {
      running++;
      if (running > maxRunning) {
        maxRunning = running;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
      return item;
    });

    expect(maxRunning).toBeLessThanOrEqual(4);
  });
});
