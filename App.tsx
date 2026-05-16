import {
  DarkTheme as NavDark,
  DefaultTheme as NavLight,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { ConvertScreen } from './src/screens/ConvertScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OptionsScreen } from './src/screens/OptionsScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TargetFormatScreen } from './src/screens/TargetFormatScreen';
import type { Palette } from './src/theme/colors';
import { useTheme } from './src/theme/useTheme';
import type { RootStackParamList, TabsParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();

function makeNavTheme(palette: Palette) {
  const base = palette.scheme === 'dark' ? NavDark : NavLight;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: palette.bg,
      card: palette.bg,
      text: palette.text,
      border: palette.border,
      primary: palette.accent,
    },
  };
}

function TabIcon({ name, color }: { name: 'convert' | 'history' | 'settings'; color: string }) {
  if (name === 'convert') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M5 9h11l-3-3M19 15H8l3 3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (name === 'history') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v4h4"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M12 7v5l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={1.8} />
      <Path d="M8 9h8M8 13h8M8 17h5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function MainTabs() {
  const c = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textSec,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
        },
        tabBarLabel: ({ focused, color }) => (
          <Text style={[styles.tabLabel, { color, fontWeight: focused ? '600' : '500' }]}>
            {route.name}
          </Text>
        ),
        tabBarIcon: ({ color }) => {
          const name =
            route.name === 'Convert' ? 'convert' : route.name === 'History' ? 'history' : 'settings';
          return (
            <View style={styles.tabIconWrap}>
              <TabIcon name={name} color={color} />
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="Convert" component={ConvertScreen} />
      <Tabs.Screen name="History" component={HistoryScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

function ThemedApp() {
  const c = useTheme();
  const navTheme = makeNavTheme(c);

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={MainTabs} />
        <Stack.Screen name="TargetFormat" component={TargetFormatScreen} />
        <Stack.Screen name="Options" component={OptionsScreen} />
        <Stack.Screen name="Progress" component={ProgressScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      <ThemedApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: { alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, marginTop: -2 },
});
