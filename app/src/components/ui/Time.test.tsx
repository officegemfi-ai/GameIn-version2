import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TimeAgo, TimeLeft } from './Time';

afterEach(() => vi.useRealTimers());

describe('time labels', () => {
  it('share one timer however many are on screen, and stop it when none are', () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') });
    const every = vi.spyOn(window, 'setInterval');
    const stop = vi.spyOn(window, 'clearInterval');
    const at = new Date('2026-11-09T11:55:00Z').toISOString();
    const view = render(
      <>
        {Array.from({ length: 50 }, (_, i) => (
          <TimeAgo key={i} at={at} />
        ))}
      </>,
    );
    expect(screen.getAllByText('5 min ago')).toHaveLength(50);
    expect(every.mock.calls.filter(([, ms]) => ms === 60_000)).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText('6 min ago')).toHaveLength(50);

    view.unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('count down, and say when the time is up', () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') });
    render(<TimeLeft until="2026-11-09T12:01:00Z" />);
    expect(screen.getByText('1 min left')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(90_000));
    expect(screen.getByText('expired')).toBeTruthy();
  });
});
