import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth, type Role } from './AuthContext';
import { colors } from '../components/theme';

/**
 * Permit a screen based on the user's role and (optionally) the
 * building-admin flag. System admins (role==='admin') are application-level
 * managers — they only see the Buildings CRUD screens. The day-to-day of a
 * single building (units, users, etc.) is the building admin's surface,
 * gated separately via `requireBuildingAdmin`.
 *
 * Modes:
 *  - `roles=['admin']`                          → strict system-admin
 *  - `roles=['owner', ...]`                     → strict role match
 *  - `requireBuildingAdmin`                     → owner role + isBuildingAdmin
 *                                                  (ignores `roles`)
 */
export function RoleGate({
  children,
  roles,
  requireBuildingAdmin,
}: {
  children: ReactNode;
  roles?: Role[];
  requireBuildingAdmin?: boolean;
}) {
  const { user } = useAuth();
  if (!user) return null;
  const isBuildingAdminOwner = user.role === 'owner' && !!user.isBuildingAdmin;
  const allowed = requireBuildingAdmin
    ? isBuildingAdminOwner
    : !!roles && roles.includes(user.role);
  if (!allowed) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Forbidden.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  text: { color: colors.danger },
});
