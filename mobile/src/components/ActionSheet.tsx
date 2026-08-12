import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { SheetHeader, SheetMenuItem } from './ListChrome';
import type { IconName } from './Icon';

export interface ActionSheetItem {
  icon?: IconName;
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'muted';
  onPress: () => void;
}

/**
 * Generic "pick one action" sheet — the replacement for chained confirm()
 * dialogs (decline A → get asked B), which read as the app refusing to let
 * the user cancel. Item handlers are deferred until the sheet has fully
 * closed: presenting another Modal (confirm, form sheet) while this one is
 * still dismissing freezes iOS.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  subtitle,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: ActionSheetItem[];
}) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onClosed={() => {
        const run = pending;
        setPending(null);
        run?.();
      }}
    >
      <SheetHeader title={title} subtitle={subtitle} />
      {items.map((it) => (
        <SheetMenuItem
          key={it.label}
          icon={it.icon}
          label={it.label}
          tone={it.tone}
          onPress={() => {
            setPending(() => it.onPress);
            onClose();
          }}
        />
      ))}
    </BottomSheet>
  );
}
