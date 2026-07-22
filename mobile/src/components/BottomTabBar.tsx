import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { hasModule, MODULES } from '../auth/capabilities';
import { palette, radii, shadow, spacing, type } from './theme';
import { QuickActionsModal } from './QuickActionsModal';
import { BottomSheet } from './BottomSheet';
import { Icon, type IconName } from './Icon';
import { useT } from '../i18n';
import type { StringKey } from '../i18n/strings';
import type { MainTabParamList } from '../navigation/types';

export const TAB_BAR_HEIGHT = 64;

/**
 * Custom tab bar that drives a `Tab.Navigator`. Receives state +
 * navigation via `BottomTabBarProps` (the navigator owns routing); the bar
 * itself is purely a visual + capability-aware filter.
 *
 * Behavior the underlying navigator gives us (no work needed here):
 *   • tap a different tab        → jump to it, restore its stack history
 *   • tap the current tab again  → popToTop (back to that tab's root)
 *   • drill-ins inside a tab     → push onto that tab's stack with a back button
 *   • no back button on tab roots
 */

type TabRoute = keyof MainTabParamList;

interface TabDef {
  route: TabRoute;
  labelKey: StringKey;
  // Symbolic icon name; null renders an empty filler slot.
  icon: IconName | null;
  // When undefined, the tab is always visible (e.g. Home). Otherwise the
  // user's capabilities must include this module id.
  capability?: string;
}

const ALL_TABS: TabDef[] = [
  { route: 'HomeTab', labelKey: 'nav_home', icon: 'home' },
  { route: 'PaymentsTab', labelKey: 'nav_payments', icon: 'payments', capability: MODULES.PAYMENTS },
  { route: 'PollsTab', labelKey: 'nav_polls', icon: 'polls', capability: MODULES.POLLS },
  { route: 'DocumentsTab', labelKey: 'nav_docs', icon: 'documents', capability: MODULES.DOCUMENTS },
  { route: 'MaintenanceTab', labelKey: 'nav_maintenance', icon: 'maintenance', capability: MODULES.MAINTENANCE },
  { route: 'ExpensesTab', labelKey: 'nav_expenses', icon: 'expenses', capability: MODULES.EXPENSES },
  { route: 'UnitsTab', labelKey: 'nav_units', icon: 'units', capability: MODULES.UNITS },
  { route: 'UsersTab', labelKey: 'nav_users', icon: 'users', capability: MODULES.USERS },
  { route: 'HouseholdTab', labelKey: 'nav_household', icon: 'household', capability: MODULES.HOUSEHOLD },
  { route: 'BuildingsTab', labelKey: 'nav_buildings', icon: 'buildings', capability: MODULES.SYSTEM_BUILDINGS },
  { route: 'AllUsersTab', labelKey: 'nav_users', icon: 'users', capability: MODULES.SYSTEM_USERS },
  { route: 'PricingTab', labelKey: 'nav_pricing', icon: 'pricing', capability: MODULES.SYSTEM_PRICING },
  { route: 'AdminPaymentsTab', labelKey: 'nav_admin_payments', icon: 'payments', capability: MODULES.SYSTEM_PAYMENTS },
];

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { capabilities: caps } = useAuth();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const currentRoute = state.routes[state.index]?.name as TabRoute | undefined;

  // Exactly four visible slots (2 left + 2 right of the center FAB).
  // Home is always slot 0. The remaining accessible modules fill slots 1–3;
  // if there are extras, slot 3 becomes "More" and the rest go into the sheet.
  const { leftTwo, rightTwo, moreTabs } = useMemo(() => {
    const home = ALL_TABS[0];
    const accessible = ALL_TABS.slice(1).filter((t) => !t.capability || hasModule(caps, t.capability));
    const hasOverflow = accessible.length > 2;
    const visible: TabDef[] = hasOverflow
      ? [home, ...accessible.slice(0, 2), { route: 'HomeTab', labelKey: 'nav_more' as StringKey, icon: 'more' }]
      : [home, ...accessible];
    while (visible.length < 4) {
      visible.push({ route: 'HomeTab', labelKey: '_empty' as unknown as StringKey, icon: null });
    }
    const overflow = hasOverflow ? accessible.slice(2) : [];
    return { leftTwo: visible.slice(0, 2), rightTwo: visible.slice(2, 4), moreTabs: overflow };
  }, [caps]);

  function go(route: TabRoute) {
    // jumpTo: switch the tab, restoring its existing stack (default for
    // Tab.Navigator). Tapping the current tab triggers tabPress on the
    // focused screen, which the navigator natively handles as popToTop.
    if (route === currentRoute) {
      // popToTop within the current tab. Dispatch the tabPress event so
      // listeners (if any) can pre-empt. The default behavior reset the
      // nested stack to its root.
      navigation.emit({
        type: 'tabPress',
        target: state.routes[state.index].key,
        canPreventDefault: true,
      });
      navigation.navigate(route);
      return;
    }
    navigation.navigate(route);
  }

  function handleTab(t: TabDef) {
    if (t.icon === null) return; // empty filler slot
    if (t.labelKey === 'nav_more') {
      setMoreOpen(true);
      return;
    }
    go(t.route);
  }

  const safeBottom = Math.max(insets.bottom, 8);

  return (
    <>
      <View style={[styles.barWrap, { paddingBottom: safeBottom }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <View style={styles.side}>
            {leftTwo.map((t, i) => (
              <TabButton
                key={`${t.route}-${i}`}
                tab={t}
                active={currentRoute === t.route && t.icon !== null}
                onPress={() => handleTab(t)}
              />
            ))}
          </View>
          <View style={styles.centerSpacer} />
          <View style={styles.side}>
            {rightTwo.map((t, i) => (
              <TabButton
                key={`${t.route}-${i}`}
                tab={t}
                active={currentRoute === t.route && t.icon !== null}
                onPress={() => handleTab(t)}
              />
            ))}
          </View>
        </View>

        {/* Center quick-actions FAB */}
        <View style={[styles.fabWrap, { bottom: safeBottom + 18 }]} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={0.85} onPress={() => setQuickOpen(true)}>
            <LinearGradient
              colors={[palette.accent, '#7c3aed']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <Icon name="quick" size={26} color="#fff" strokeWidth={2.4} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <QuickActionsModal open={quickOpen} onClose={() => setQuickOpen(false)} />

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        tabs={moreTabs}
        currentRoute={currentRoute}
        onPick={(route) => {
          setMoreOpen(false);
          go(route);
        }}
      />
    </>
  );
}

function TabButton({ tab, active, onPress }: { tab: TabDef; active: boolean; onPress: () => void }) {
  const t = useT();
  if (tab.icon === null) {
    // Empty filler slot — keep the layout width, render nothing.
    return <View style={styles.tab} />;
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.tab} hitSlop={4}>
      <Icon name={tab.icon} size={22} color={active ? palette.accent : palette.textSubtle} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tab.labelKey)}</Text>
    </TouchableOpacity>
  );
}

function MoreSheet({
  open,
  onClose,
  tabs,
  currentRoute,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  tabs: TabDef[];
  currentRoute?: TabRoute;
  onPick: (route: TabRoute) => void;
}) {
  const t = useT();
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>{t('nav_more')}</Text>
      <View style={styles.moreGrid}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.route}
            style={[styles.moreItem, currentRoute === tab.route && styles.moreItemActive]}
            activeOpacity={0.85}
            onPress={() => onPick(tab.route)}
          >
            {tab.icon ? <Icon name={tab.icon} size={24} color={palette.text} /> : null}
            <Text style={styles.moreLabel}>{t(tab.labelKey)}</Text>
          </TouchableOpacity>
        ))}
        {tabs.length === 0 && (
          <Text style={type.small}>{t('empty_tabs_overflow')}</Text>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Rendered in Tab.Navigator's tabBar slot (normal flow), not absolutely
  // positioned. The navigator allocates the bar's height in the content
  // layout, so screens don't need to reserve bottom padding themselves.
  barWrap: {
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    ...shadow,
  },
  bar: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  side: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  centerSpacer: { width: 72 },
  tab: { alignItems: 'center', justifyContent: 'center', minWidth: 56, gap: 2, paddingVertical: 6 },
  tabGlyph: { fontSize: 20, color: palette.textSubtle, opacity: 0.55 },
  tabGlyphActive: { color: palette.accent, opacity: 1 },
  tabLabel: { fontSize: 10, color: palette.textSubtle, fontWeight: '500' },
  tabLabelActive: { color: palette.accent, fontWeight: '700' },

  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabGlyph: { fontSize: 26 },

  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  moreItem: {
    width: '30%',
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  moreItemActive: { backgroundColor: palette.accentSoft },
  moreGlyph: { fontSize: 26 },
  moreLabel: { fontSize: 12, color: palette.text, fontWeight: '600' },
});
