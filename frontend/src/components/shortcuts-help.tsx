'use client';

import { Keyboard, Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUIStore } from '@/stores/ui-store';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutSections: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['J'], description: 'Next conversation' },
      { keys: ['K'], description: 'Previous conversation' },
      { keys: ['G', 'I'], description: 'Go to Inbox' },
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['R'], description: 'Reply (focus message input)' },
      { keys: ['E'], description: 'Close conversation' },
      { keys: ['P'], description: 'Pin/Unpin conversation' },
      { keys: ['Esc'], description: 'Clear selection / Close panel' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['\u2318', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['\u2318', '/'], description: 'Toggle conversation list' },
    ],
  },
];

function ShortcutKey({ char }: { char: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium">
      {char === '\u2318' ? <Command className="h-3 w-3" /> : char}
    </kbd>
  );
}

export function ShortcutsHelpDialog() {
  const { shortcutsHelpOpen, closeShortcutsHelp } = useUIStore();

  return (
    <Dialog open={shortcutsHelpOpen} onOpenChange={(open) => !open && closeShortcutsHelp()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate faster. Press <ShortcutKey char="?" /> anywhere to show this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {shortcutSections.map((section) => (
            <div key={section.title}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3">{section.title}</h4>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center">
                          <ShortcutKey char={key} />
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="mx-1 text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Tip: Most shortcuts only work when not typing in an input field
        </p>
      </DialogContent>
    </Dialog>
  );
}
