export type AuthStackParamList = {
  Login: undefined;
  AcceptInvite: { token?: string } | undefined;
};

/**
 * Union of every screen across every tab's stack. Most callers can keep
 * typing their `useNavigation` against this — react-navigation walks the
 * parent navigators until it finds a screen with the requested name, so
 * cross-stack `navigation.navigate('BuildingDetail', …)` style calls still
 * resolve inside the current tab's stack.
 */
export type AppStackParamList = {
  Dashboard: undefined;
  Payments: undefined;
  Expenses: undefined;
  Polls: undefined;
  Maintenance: undefined;
  Documents: undefined;
  Units: undefined;
  UnitDetail: { unitNumber: string };
  Users: undefined;
  MyHousehold: undefined;
  Buildings: undefined;
  BuildingDetail: { buildingId: string };
  BuildingUsers: {
    buildingId: string;
    buildingName?: string;
    unitId?: string;
    unitNumber?: string;
  };
  BuildingActions: { buildingId: string; buildingName?: string; currency?: string };
  BuildingUnits: { buildingId: string; buildingName?: string };
  AllUsers: undefined;
  AdminPricing: undefined;
  AdminPayments: undefined;
  Settings: undefined;
};

/**
 * Top-level bottom-tab navigator. Each tab is its own native-stack so the
 * stack history (drill-ins, scroll position, form state) is preserved when
 * the user switches tabs and comes back. Tap a tab while already on it →
 * popToTop. Tap a different tab → switch and restore that tab's history.
 */
export type MainTabParamList = {
  HomeTab: undefined;
  PaymentsTab: undefined;
  ExpensesTab: undefined;
  PollsTab: undefined;
  MaintenanceTab: undefined;
  DocumentsTab: undefined;
  UnitsTab: undefined;
  UsersTab: undefined;
  HouseholdTab: undefined;
  BuildingsTab: undefined;
  AllUsersTab: undefined;
  PricingTab: undefined;
  AdminPaymentsTab: undefined;
};
