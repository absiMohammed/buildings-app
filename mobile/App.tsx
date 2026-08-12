import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/components/textDefaults';
import { AuthProvider } from './src/auth/AuthContext';
import { LanguageProvider } from './src/i18n';
import { ConfirmProvider } from './src/components/ConfirmProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      {/* The palette is light-only — dark icons always, or OS dark mode
          renders white-on-white in the status bar. */}
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <LanguageProvider>
          <AuthProvider>
            <ConfirmProvider>
              <RootNavigator />
            </ConfirmProvider>
          </AuthProvider>
        </LanguageProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
