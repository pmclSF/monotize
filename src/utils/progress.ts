import { EventEmitter } from 'node:events';

export interface ProgressEvent {
  current: number;
  total: number;
  label: string;
  percentage: number;
}

/**
 * Simple progress tracker that emits events as items are processed.
 */
export class ProgressEmitter extends EventEmitter {
  private current = 0;
  private total: number;

  constructor(total: number) {
    super();
    this.total = total;
  }

  tick(label: string): void {
    this.current++;
    const event: ProgressEvent = {
      current: this.current,
      total: this.total,
      label,
      percentage: Math.round((this.current / this.total) * 100),
    };
    this.emit('progress', event);

    if (this.current >= this.total) {
      this.emit('done');
    }
  }

  reset(total?: number): void {
    this.current = 0;
    if (total !== undefined) {
      this.total = total;
    }
  }
}

/**
 * Create a progress emitter.
 */
export function createProgressEmitter(total: number): ProgressEmitter {
  return new ProgressEmitter(total);
}
