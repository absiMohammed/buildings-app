import { StyleSheet, Text } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../components/theme';

interface Props {
  title: string;
  body?: string;
}

export function PlaceholderPage({ title, body }: Props) {
  return (
    <ScreenContainer>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        {body ?? 'Wire this page up against the API in the next step.'}
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 8 },
  body: { color: colors.textSubtle, fontSize: 13 },
});
