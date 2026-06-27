// Injectable clock so the scheduler and timers are deterministic under test.
export interface Clock {
  now(): number;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class FakeClock implements Clock {
  private t: number;
  constructor(start = 0) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
