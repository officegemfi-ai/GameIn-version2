import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ActionDialog } from './Dialog';
import { TextAreaField } from './Field';

afterEach(cleanup);

function Harness({ typed = true }: { typed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  return (
    <>
      <button onClick={() => setOpen(true)}>request changes</button>
      <ActionDialog open={open} onClose={() => setOpen(false)} title="Request changes" action="send" onAction={() => {}}>
        {typed ? <TextAreaField label="What needs to change" value={note} onChange={(e) => setNote(e.target.value)} data-autofocus /> : <p>Sure?</p>}
      </ActionDialog>
    </>
  );
}

describe('a dialog', () => {
  it('puts the cursor in the field that asks for it, not on the close button before it', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'request changes' });
    opener.focus();
    fireEvent.click(opener);
    // on the close button, the first space typed into the "note" pressed it and closed the dialog
    expect(document.activeElement).toBe(screen.getByLabelText('What needs to change'));
  });

  it('starts on its first control when no field asks, and gives focus back when it closes', () => {
    render(<Harness typed={false} />);
    const opener = screen.getByRole('button', { name: 'request changes' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus back after a dialog with a field, too', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'request changes' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(document.activeElement).toBe(opener);
  });
});
