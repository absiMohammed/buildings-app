import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { RoleGate } from '../auth/RoleGate';
import { palette, type } from '../components/theme';
import { LoginPage } from '../pages/LoginPage';
import { AcceptInvitePage } from '../pages/AcceptInvitePage';
import { DashboardPage } from '../pages/DashboardPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { ExpensesPage } from '../pages/ExpensesPage';
import { PollsPage } from '../pages/PollsPage';
import { MaintenancePage } from '../pages/MaintenancePage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { UnitsPage } from '../pages/UnitsPage';
import { UnitDetailPage } from '../pages/UnitDetailPage';
import { MyHouseholdPage } from '../pages/MyHouseholdPage';
import { BuildingsPage } from '../pages/BuildingsPage';
import { BuildingDetailPage } from '../pages/BuildingDetailPage';
import { BuildingUsersPage } from '../pages/BuildingUsersPage';
import { AllUsersPage } from '../pages/AllUsersPage';
import { AdminPricingPage } from '../pages/AdminPricingPage';
import { AdminPaymentsPage } from '../pages/AdminPaymentsPage';
import { UsersPage } from '../pages/UsersPage';
import { SettingsPage } from '../pages/SettingsPage';
import type { AppStackParamList, AuthStackParamList, MainTabParamList } from './types';
import { BottomTabBar } from '../components/BottomTabBar';
import { useT } from '../i18n';

/**
 * Navigation tree (post-refactor):
 *
 *   NavigationContainer
 *   └─ if (user)
 *       └─ Tab.Navigator  ← preserves per-tab state, no back-button to other tabs
 *           ├─ HomeTab        — Stack: Dashboard → Settings
 *           ├─ PaymentsTab    — Stack: Payments
 *           ├─ ExpensesTab    — Stack: Expenses
 *           ├─ PollsTab       — Stack: Polls
 *           ├─ MaintenanceTab — Stack: Maintenance
 *           ├─ DocumentsTab   — Stack: Documents
 *           ├─ UnitsTab       — Stack: Units → UnitDetail
 *           ├─ UsersTab       — Stack: Users
 *           ├─ HouseholdTab   — Stack: MyHousehold
 *           ├─ BuildingsTab   — Stack: Buildings → BuildingDetail → BuildingUsers
 *           ├─ AllUsersTab    — Stack: AllUsers → BuildingUsers
 *           └─ PricingTab     — Stack: AdminPricing
 *   else
 *       └─ AuthStack
 *
 * Each per-tab stack is its own NativeStackNavigator, so drill-ins push
 * inside the tab and the back button only appears for those drill-ins —
 * never on a tab's root. The custom BottomTabBar is passed as
 * `tabBar={(props) => <BottomTabBar {...props} />}` so the navigator owns
 * routing while the visual stays ours.
 */

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Per-tab stacks. They all use the same screenOptions via `commonStackOptions`
// (shared header style + ViewModeChip on the right). Reusing AppStackParamList
// keeps useNavigation<NativeStackNavigationProp<AppStackParamList>> callers
// happy — every screen name in the union is reachable from at least one
// tab's stack, and react-navigation resolves cross-stack navigates by
// walking parent navigators.
const HomeStack = createNativeStackNavigator<AppStackParamList>();
const PaymentsStack = createNativeStackNavigator<AppStackParamList>();
const ExpensesStack = createNativeStackNavigator<AppStackParamList>();
const PollsStack = createNativeStackNavigator<AppStackParamList>();
const MaintenanceStack = createNativeStackNavigator<AppStackParamList>();
const DocumentsStack = createNativeStackNavigator<AppStackParamList>();
const UnitsStack = createNativeStackNavigator<AppStackParamList>();
const UsersStack = createNativeStackNavigator<AppStackParamList>();
const HouseholdStack = createNativeStackNavigator<AppStackParamList>();
const BuildingsStack = createNativeStackNavigator<AppStackParamList>();
const AllUsersStack = createNativeStackNavigator<AppStackParamList>();
const PricingStack = createNativeStackNavigator<AppStackParamList>();
const AdminPaymentsStack = createNativeStackNavigator<AppStackParamList>();

const commonStackOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: palette.bg },
  headerShadowVisible: false,
  headerTitleStyle: { color: palette.text, fontWeight: '700', fontSize: 18 },
  headerTitleAlign: 'center',
  headerTintColor: palette.accent,
  headerBackTitle: '',
  contentStyle: { backgroundColor: palette.bg },
  // Note on `headerRight`: NOT set here. iOS native-stack reserves a slot
  // for whatever `headerRight` returns — even an element that renders
  // null produces an empty button frame. Building-admin owners opt-in to
  // the chip via `useHeaderViewModeChip()` from their screens; every
  // other role gets no slot.
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <AuthStack.Screen name="Login" component={LoginPage} />
      <AuthStack.Screen name="AcceptInvite" component={AcceptInvitePage} />
    </AuthStack.Navigator>
  );
}

function HomeStackScreen() {
  const t = useT();
  return (
    <HomeStack.Navigator screenOptions={commonStackOptions}>
      <HomeStack.Screen name="Dashboard" component={DashboardPage} options={{ headerShown: false }} />
      <HomeStack.Screen name="Settings" component={SettingsPage} options={{ title: t('nav_settings') }} />
    </HomeStack.Navigator>
  );
}

function PaymentsStackScreen() {
  const t = useT();
  return (
    <PaymentsStack.Navigator screenOptions={commonStackOptions}>
      <PaymentsStack.Screen name="Payments" component={PaymentsPage} options={{ title: t('nav_payments') }} />
    </PaymentsStack.Navigator>
  );
}

function ExpensesStackScreen() {
  const t = useT();
  return (
    <ExpensesStack.Navigator screenOptions={commonStackOptions}>
      <ExpensesStack.Screen name="Expenses" component={ExpensesPage} options={{ title: t('nav_expenses') }} />
    </ExpensesStack.Navigator>
  );
}

function PollsStackScreen() {
  const t = useT();
  return (
    <PollsStack.Navigator screenOptions={commonStackOptions}>
      <PollsStack.Screen name="Polls" component={PollsPage} options={{ title: t('nav_polls') }} />
    </PollsStack.Navigator>
  );
}

function MaintenanceStackScreen() {
  const t = useT();
  return (
    <MaintenanceStack.Navigator screenOptions={commonStackOptions}>
      <MaintenanceStack.Screen name="Maintenance" component={MaintenancePage} options={{ title: t('nav_maintenance') }} />
    </MaintenanceStack.Navigator>
  );
}

function DocumentsStackScreen() {
  const t = useT();
  return (
    <DocumentsStack.Navigator screenOptions={commonStackOptions}>
      <DocumentsStack.Screen name="Documents" component={DocumentsPage} options={{ title: t('nav_documents') }} />
    </DocumentsStack.Navigator>
  );
}

function UnitsStackScreen() {
  const t = useT();
  return (
    <UnitsStack.Navigator screenOptions={commonStackOptions}>
      <UnitsStack.Screen name="Units" options={{ title: t('nav_units') }}>
        {() => (
          <RoleGate requireBuildingAdmin>
            <UnitsPage />
          </RoleGate>
        )}
      </UnitsStack.Screen>
      <UnitsStack.Screen
        name="UnitDetail"
        options={({ route }) => ({
          title: `Unit ${(route.params as { unitNumber?: string }).unitNumber ?? ''}`,
        })}
      >
        {() => (
          <RoleGate requireBuildingAdmin>
            <UnitDetailPage />
          </RoleGate>
        )}
      </UnitsStack.Screen>
    </UnitsStack.Navigator>
  );
}

function UsersStackScreen() {
  const t = useT();
  return (
    <UsersStack.Navigator screenOptions={commonStackOptions}>
      <UsersStack.Screen name="Users" options={{ title: t('nav_users') }}>
        {() => (
          <RoleGate requireBuildingAdmin>
            <UsersPage />
          </RoleGate>
        )}
      </UsersStack.Screen>
    </UsersStack.Navigator>
  );
}

function HouseholdStackScreen() {
  const t = useT();
  return (
    <HouseholdStack.Navigator screenOptions={commonStackOptions}>
      <HouseholdStack.Screen name="MyHousehold" options={{ title: t('nav_household') }}>
        {() => (
          <RoleGate roles={['renter']}>
            <MyHouseholdPage />
          </RoleGate>
        )}
      </HouseholdStack.Screen>
    </HouseholdStack.Navigator>
  );
}

function BuildingsStackScreen() {
  const t = useT();
  return (
    <BuildingsStack.Navigator screenOptions={commonStackOptions}>
      <BuildingsStack.Screen name="Buildings" options={{ title: t('nav_buildings') }}>
        {() => (
          <RoleGate roles={['admin']}>
            <BuildingsPage />
          </RoleGate>
        )}
      </BuildingsStack.Screen>
      <BuildingsStack.Screen name="BuildingDetail" options={{ title: t('nav_buildings') }}>
        {() => (
          <RoleGate roles={['admin']}>
            <BuildingDetailPage />
          </RoleGate>
        )}
      </BuildingsStack.Screen>
      <BuildingsStack.Screen
        name="BuildingUsers"
        options={({ route }) => ({
          title: (route.params as { buildingName?: string }).buildingName ?? t('nav_users'),
        })}
      >
        {() => (
          <RoleGate roles={['admin']}>
            <BuildingUsersPage />
          </RoleGate>
        )}
      </BuildingsStack.Screen>
    </BuildingsStack.Navigator>
  );
}

function AllUsersStackScreen() {
  const t = useT();
  return (
    <AllUsersStack.Navigator screenOptions={commonStackOptions}>
      <AllUsersStack.Screen name="AllUsers" options={{ title: t('nav_users') }}>
        {() => (
          <RoleGate roles={['admin']}>
            <AllUsersPage />
          </RoleGate>
        )}
      </AllUsersStack.Screen>
      <AllUsersStack.Screen
        name="BuildingUsers"
        options={({ route }) => ({
          title: (route.params as { buildingName?: string }).buildingName ?? t('nav_users'),
        })}
      >
        {() => (
          <RoleGate roles={['admin']}>
            <BuildingUsersPage />
          </RoleGate>
        )}
      </AllUsersStack.Screen>
    </AllUsersStack.Navigator>
  );
}

function PricingStackScreen() {
  const t = useT();
  return (
    <PricingStack.Navigator screenOptions={commonStackOptions}>
      <PricingStack.Screen name="AdminPricing" options={{ title: t('nav_pricing') }}>
        {() => (
          <RoleGate roles={['admin']}>
            <AdminPricingPage />
          </RoleGate>
        )}
      </PricingStack.Screen>
    </PricingStack.Navigator>
  );
}

function AdminPaymentsStackScreen() {
  const t = useT();
  return (
    <AdminPaymentsStack.Navigator screenOptions={commonStackOptions}>
      <AdminPaymentsStack.Screen name="AdminPayments" options={{ title: t('nav_admin_payments') }}>
        {() => (
          <RoleGate roles={['admin']}>
            <AdminPaymentsPage />
          </RoleGate>
        )}
      </AdminPaymentsStack.Screen>
    </AdminPaymentsStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // `lazy: true` defers mounting a tab's stack until first visit;
        // the per-tab state is then kept alive in memory so subsequent
        // visits restore scroll position, search input, drill-in history.
        lazy: true,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen name="PaymentsTab" component={PaymentsStackScreen} />
      <Tab.Screen name="ExpensesTab" component={ExpensesStackScreen} />
      <Tab.Screen name="PollsTab" component={PollsStackScreen} />
      <Tab.Screen name="MaintenanceTab" component={MaintenanceStackScreen} />
      <Tab.Screen name="DocumentsTab" component={DocumentsStackScreen} />
      <Tab.Screen name="UnitsTab" component={UnitsStackScreen} />
      <Tab.Screen name="UsersTab" component={UsersStackScreen} />
      <Tab.Screen name="HouseholdTab" component={HouseholdStackScreen} />
      <Tab.Screen name="BuildingsTab" component={BuildingsStackScreen} />
      <Tab.Screen name="AllUsersTab" component={AllUsersStackScreen} />
      <Tab.Screen name="PricingTab" component={PricingStackScreen} />
      <Tab.Screen name="AdminPaymentsTab" component={AdminPaymentsStackScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const t = useT();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.textSubtle} />
        <Text style={[type.small, { marginTop: 8 }]}>{t('loading')}</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg },
});
