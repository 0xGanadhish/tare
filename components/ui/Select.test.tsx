// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Select } from './Select';

afterEach(cleanup);

test('hides the native arrow and draws its own chevron inside the padding', () => {
  const { container } = render(<Select aria-label="Network" defaultValue="a"><option value="a">A</option></Select>);
  const select = container.querySelector('select')!;
  expect(select.className).toContain('appearance-none');
  expect(select.className).toContain('pr-8');
  const chevron = container.querySelector('svg')!;
  expect(chevron.getAttribute('aria-hidden')).toBe('true');
  expect(chevron.getAttribute('class')).toContain('right-3');
  expect(chevron.getAttribute('class')).toContain('pointer-events-none');
});

test('passes value, onChange and classes through', () => {
  const onChange = vi.fn();
  const { container } = render(
    <Select value="b" onChange={onChange} className="mono" wrapperClassName="mt-2 w-full">
      <option value="a">A</option><option value="b">B</option>
    </Select>,
  );
  const select = container.querySelector('select')!;
  expect(select.value).toBe('b');
  expect(select.className).toContain('mono');
  expect((container.firstChild as HTMLElement).className).toContain('mt-2 w-full');
  fireEvent.change(select, { target: { value: 'a' } });
  expect(onChange).toHaveBeenCalledOnce();
});
