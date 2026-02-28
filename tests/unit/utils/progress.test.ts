import { describe, it, expect } from 'vitest';
import { ProgressEmitter, createProgressEmitter } from '../../../src/utils/progress.js';
import type { ProgressEvent } from '../../../src/utils/progress.js';

describe('ProgressEmitter', () => {
  it('should emit progress events with correct data', () => {
    const emitter = new ProgressEmitter(3);
    const events: ProgressEvent[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      events.push(event);
    });

    emitter.tick('step 1');
    emitter.tick('step 2');

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      current: 1,
      total: 3,
      label: 'step 1',
      percentage: 33,
    });
    expect(events[1]).toEqual({
      current: 2,
      total: 3,
      label: 'step 2',
      percentage: 67,
    });
  });

  it('should emit done event after all ticks', () => {
    const emitter = new ProgressEmitter(2);
    let doneEmitted = false;

    emitter.on('done', () => {
      doneEmitted = true;
    });

    emitter.tick('first');
    expect(doneEmitted).toBe(false);

    emitter.tick('second');
    expect(doneEmitted).toBe(true);
  });

  it('should not emit done before all items are processed', () => {
    const emitter = new ProgressEmitter(5);
    let doneEmitted = false;

    emitter.on('done', () => {
      doneEmitted = true;
    });

    emitter.tick('1');
    emitter.tick('2');
    emitter.tick('3');
    emitter.tick('4');
    expect(doneEmitted).toBe(false);

    emitter.tick('5');
    expect(doneEmitted).toBe(true);
  });

  it('should reset current progress', () => {
    const emitter = new ProgressEmitter(3);
    const events: ProgressEvent[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      events.push(event);
    });

    emitter.tick('before reset');
    expect(events[0].current).toBe(1);

    emitter.reset();
    emitter.tick('after reset');
    expect(events[1].current).toBe(1);
    expect(events[1].total).toBe(3);
  });

  it('should reset with a new total', () => {
    const emitter = new ProgressEmitter(3);
    const events: ProgressEvent[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      events.push(event);
    });

    emitter.tick('before');
    emitter.reset(10);
    emitter.tick('after');

    expect(events[1].current).toBe(1);
    expect(events[1].total).toBe(10);
    expect(events[1].percentage).toBe(10);
  });

  it('should calculate percentage correctly', () => {
    const emitter = new ProgressEmitter(4);
    const percentages: number[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      percentages.push(event.percentage);
    });

    emitter.tick('1');
    emitter.tick('2');
    emitter.tick('3');
    emitter.tick('4');

    expect(percentages).toEqual([25, 50, 75, 100]);
  });

  it('should round percentage to nearest integer', () => {
    const emitter = new ProgressEmitter(3);
    const percentages: number[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      percentages.push(event.percentage);
    });

    emitter.tick('1'); // 1/3 = 33.33... -> 33
    emitter.tick('2'); // 2/3 = 66.66... -> 67
    emitter.tick('3'); // 3/3 = 100

    expect(percentages).toEqual([33, 67, 100]);
  });
});

describe('createProgressEmitter', () => {
  it('should create a ProgressEmitter instance', () => {
    const emitter = createProgressEmitter(5);
    expect(emitter).toBeInstanceOf(ProgressEmitter);
  });

  it('should create a functional emitter', () => {
    const emitter = createProgressEmitter(2);
    const events: ProgressEvent[] = [];

    emitter.on('progress', (event: ProgressEvent) => {
      events.push(event);
    });

    emitter.tick('item');
    expect(events).toHaveLength(1);
    expect(events[0].total).toBe(2);
  });
});
