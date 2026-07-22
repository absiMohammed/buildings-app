import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { SheetHeader, SheetMenuItem } from './ListChrome';
import type { IconName } from './Icon';
import { useI18n } from '../i18n';

export interface UserSheetItem {
  key: string;
  icon?: IconName;
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'muted';
  onPress: () => void;
}

/**
 * Shared action sheet for a user, used by both the cross-building roster
 * (AllUsers) and a single building's roster (BuildingUsers). The caller
 * supplies the items; building-scoped screens preset the building, the
 * cross-building screen lists an action per building the user belongs to.
 *
 * Each item's onPress is deferred until the sheet finishes closing, so it can
 * safely open another sheet/modal (confirm, editor) without the iOS
 * modal-over-modal freeze.
 */
export function UserActionSheet({
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
  items: UserSheetItem[];
}) {
  const { t } = useI18n();
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
      <View>
        <SheetHeader title={title} subtitle={subtitle} />
        {items.map((it) => (
          <SheetMenuItem
            key={it.key}
            icon={it.icon}
            label={it.label}
            tone={it.tone}
            onPress={() => {
              setPending(() => it.onPress);
              onClose();
            }}
          />
        ))}
        <SheetMenuItem label={t('cancel')} tone="muted" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
