import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RandodraftSpinner, type DraftSpinnerOption } from '@/components/randodraft-spinner';

vi.mock('@/lib/ui-sounds', () => ({ playUiSound: vi.fn() }));
const option = (id: string): DraftSpinnerOption => ({ id, label: id, content: id });

describe('Draft reel landing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('generates a fresh result on click and retains the final three frames after stopping', () => {
    let count = 0;
    const draw = vi.fn(() => option('fresh-' + count++));
    function Spinner() {
      const [value, setValue] = useState<string | null>(null);
      return <RandodraftSpinner label="Build path" options={[option('preview-first'), option('preview-last')]} value={value}
        disabled={false} onSpin={setValue} onBusyChange={() => {}} drawOption={draw} />;
    }
    const { container } = render(<Spinner />);
    expect(draw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Spin Build path' }));
    const reel = () => container.querySelector('button > [aria-hidden="true"]')!;
    const landing = Array.from(reel().children).slice(-3).map((node) => node.textContent);
    expect(landing).toEqual(['fresh-25', 'fresh-0', 'fresh-26']);
    act(() => vi.advanceTimersByTime(2475));
    expect(Array.from(reel().children).map((node) => node.textContent)).toEqual(landing);
    expect(screen.getByRole('button', { name: 'Build path locked: fresh-0' })).toBeDisabled();
    expect(screen.queryByText('preview-first')).not.toBeInTheDocument();
    expect(screen.queryByText('preview-last')).not.toBeInTheDocument();
  });

  it('cancels a pending completion when its pick unmounts', () => {
    const onSpin = vi.fn();
    const { unmount } = render(<RandodraftSpinner label="Lane" options={[option('Top')]} value={null} disabled={false} onSpin={onSpin} onBusyChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spin Lane' }));
    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(onSpin).not.toHaveBeenCalled();
  });

  it('runs 50% longer and clicking a running reel completes it exactly once', () => {
    const onSpin = vi.fn();
    const onBusyChange = vi.fn();
    render(<RandodraftSpinner label="Lane" options={[option('Top')]} value={null} disabled={false} onSpin={onSpin} onBusyChange={onBusyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spin Lane' }));
    act(() => vi.advanceTimersByTime(1650));
    expect(onSpin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish Lane spin' }));
    expect(onSpin).toHaveBeenCalledExactlyOnceWith('Top');
    act(() => vi.advanceTimersByTime(3000));
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(onBusyChange.mock.calls.map(([busy]) => busy)).toEqual([true, false]);
  });
});
