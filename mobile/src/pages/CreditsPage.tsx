import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth, useCurrency } from '../auth/AuthContext';
import { palette, spacing, type } from '../components/theme';
import { Avatar, Button, Card, EmptyState, PhoneText, Pill } from '../components/ui';
import { SearchField, SheetHeader, SheetMenuItem } from '../components/ListChrome';
import { BottomSheet } from '../components/BottomSheet';
import { AmountInput, parseAmount } from '../components/AmountInput';
import { fmtDate, fmtMoney } from '../utils/format';
import {
  adjustCredit,
  listCreditLedger,
  listCredits,
  type CreditLedgerEntry,
  type UserCreditBalance,
} from '../api/payments';
import { listUsers, type BuildingUser } from '../api/users';
import { apiErrorMessage, useApiResource } from '../api/useApiResource';
import { useI18n } from '../i18n';

interface CreditsData {
  credits: UserCreditBalance[];
  users: BuildingUser[];
}

interface CreditRow {
  userId: string;
  name: string;
  phone: string;
  balance: number;
}

const REASON_KEY = {
  surplus: 'credit_reason_surplus',
  auto_apply: 'credit_reason_auto',
  manual: 'credit_reason_manual',
} as const;

/**
 * Building-admin surface for prepaid credit: every resident's balance, a
 * grant/deduct action, and the movement ledger. Credit itself is granted by
 * overpaying a charge or here, and auto-applies to freshly generated dues.
 */
export function CreditsPage() {
  const currency = useCurrency();
  const { user } = useAuth();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [actionTarget, setActionTarget] = useState<CreditRow | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<CreditRow | null>(null);
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [ledgerTarget, setLedgerTarget] = useState<CreditRow | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Deferred until the action sheet finishes closing (iOS modal-over-modal).
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const fetcher = useCallback(async (): Promise<CreditsData> => {
    const [credits, users] = await Promise.all([listCredits(), listUsers()]);
    return { credits, users };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useApiResource(
    fetcher,
    t('credits_err_load')
  );

  const rows = useMemo<CreditRow[]>(() => {
    const users = data?.users ?? [];
    const byId = new Map(users.map((u) => [u._id, u]));
    // Every resident appears — zero balances included, so the admin can grant
    // credit to anyone, not only past over-payers.
    const balances = new Map((data?.credits ?? []).map((c) => [c.userId, c.balance]));
    return users
      .filter((u) => u._id !== user?._id)
      .map((u) => ({
        userId: u._id,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || byId.get(u._id)?.phone || '',
        phone: u.phone ?? '',
        balance: balances.get(u._id) ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }, [data, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q));
  }, [rows, query]);

  const totalCredit = rows.reduce((s, r) => s + r.balance, 0);

  async function openLedger(row: CreditRow) {
    setLedgerTarget(row);
    setLedger(null);
    try {
      setLedger(await listCreditLedger({ userId: row.userId }));
    } catch {
      setLedger([]);
    }
  }

  async function submitAdjust(amount: number, note: string) {
    if (!adjustTarget) return;
    setBusy(true);
    try {
      await adjustCredit({ userId: adjustTarget.userId, delta: adjustSign * amount, note });
      setAdjustTarget(null);
      await reload();
    } catch (e) {
      Alert.alert(apiErrorMessage(e, t('err_generic')));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>{t('loading')}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <EmptyState
          iconName="payments"
          title={t('credits_err_load')}
          body={error}
          action={{ label: t('retry'), onPress: () => void refresh() }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.flex1}>
          <Text style={type.caption}>{t('credits_total_caps')}</Text>
          <Text style={type.display} numberOfLines={1}>{fmtMoney(totalCredit, currency)}</Text>
          <Text style={type.small}>{t('credits_subtitle')}</Text>
        </View>
      </View>

      <SearchField value={query} onChangeText={setQuery} placeholder={t('users_search_ph')} />

      {filtered.length === 0 ? (
        <EmptyState iconName="users" title={t('credits_empty')} />
      ) : (
        <Card padded={false}>
          {filtered.map((r, i) => (
            <View key={r.userId}>
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => setActionTarget(r)}
              >
                <Avatar name={r.name} />
                <View style={styles.flex1}>
                  <Text style={[type.body, styles.bold]} numberOfLines={1}>{r.name}</Text>
                  <PhoneText phone={r.phone} style={type.small} />
                </View>
                <Pill
                  label={fmtMoney(r.balance, currency)}
                  tone={r.balance > 0 ? 'positive' : 'neutral'}
                />
              </TouchableOpacity>
              {i < filtered.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>
      )}

      {/* Per-user actions */}
      <BottomSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onClosed={() => {
          const run = pendingAction;
          setPendingAction(null);
          run?.();
        }}
      >
        <SheetHeader
          title={actionTarget?.name ?? ''}
          subtitle={actionTarget ? fmtMoney(actionTarget.balance, currency) : undefined}
        />
        <SheetMenuItem
          icon="payments"
          label={t('credit_grant')}
          onPress={() => {
            const row = actionTarget;
            setPendingAction(() => () => {
              setAdjustSign(1);
              setAdjustTarget(row);
            });
            setActionTarget(null);
          }}
        />
        {(actionTarget?.balance ?? 0) > 0 && (
          <SheetMenuItem
            icon="expenses"
            label={t('credit_deduct')}
            tone="warning"
            onPress={() => {
              const row = actionTarget;
              setPendingAction(() => () => {
                setAdjustSign(-1);
                setAdjustTarget(row);
              });
              setActionTarget(null);
            }}
          />
        )}
        <SheetMenuItem
          icon="documents"
          label={t('credit_ledger')}
          onPress={() => {
            const row = actionTarget;
            setPendingAction(() => () => {
              if (row) void openLedger(row);
            });
            setActionTarget(null);
          }}
        />
      </BottomSheet>

      <AdjustSheet
        target={adjustTarget}
        sign={adjustSign}
        currency={currency}
        busy={busy}
        onClose={() => setAdjustTarget(null)}
        onSubmit={submitAdjust}
      />

      {/* Ledger */}
      <BottomSheet open={!!ledgerTarget} onClose={() => setLedgerTarget(null)}>
        <SheetHeader title={t('credit_ledger')} subtitle={ledgerTarget?.name} />
        {ledger === null ? (
          <Text style={type.small}>{t('loading')}</Text>
        ) : ledger.length === 0 ? (
          <Text style={type.small}>{t('credit_ledger_empty')}</Text>
        ) : (
          ledger.map((e) => (
            <View key={e._id} style={styles.ledgerRow}>
              <View style={styles.flex1}>
                <Text style={type.body}>{t(REASON_KEY[e.reason])}</Text>
                <Text style={type.small}>
                  {fmtDate(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ''}
                </Text>
              </View>
              <Text style={[type.body, styles.bold, { color: e.delta > 0 ? palette.success : palette.danger }]}>
                {e.delta > 0 ? '+' : ''}{fmtMoney(e.delta, currency)}
              </Text>
            </View>
          ))
        )}
      </BottomSheet>
    </ScrollView>
  );
}

function AdjustSheet({
  target,
  sign,
  currency,
  busy,
  onClose,
  onSubmit,
}: {
  target: CreditRow | null;
  sign: 1 | -1;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => void;
}) {
  const { t, tf } = useI18n();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const amount = parseAmount(amountText) ?? 0;
  const maxDeduct = sign === -1 ? (target?.balance ?? 0) : Infinity;
  const valid = amount > 0 && amount <= maxDeduct + 0.005;

  return (
    <BottomSheet
      open={!!target}
      onClose={() => {
        setAmountText('');
        setNote('');
        onClose();
      }}
    >
      <SheetHeader
        title={sign === 1 ? t('credit_grant') : t('credit_deduct')}
        subtitle={target ? tf('credit_adjust_subtitle', { name: target.name, balance: fmtMoney(target.balance, currency) }) : undefined}
      />
      <AmountInput value={amountText} onChangeValue={setAmountText} currency={currency} />
      <Button
        label={sign === 1 ? t('credit_grant') : t('credit_deduct')}
        onPress={() => {
          onSubmit(amount, note);
          setAmountText('');
          setNote('');
        }}
        disabled={!valid}
        loading={busy}
        style={styles.adjustBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  adjustBtn: { marginTop: spacing.lg },
  flex1: { flex: 1 },
  bold: { fontWeight: '700' },
});
