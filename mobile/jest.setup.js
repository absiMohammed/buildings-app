/**
 * Global Jest setup: mock the native modules that have no JS-only
 * implementation so component tests can render without a device.
 */
/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-keychain', () => ({
  ACCESS_CONTROL: {},
  ACCESSIBLE: {},
  SECURITY_LEVEL: {},
  BIOMETRY_TYPE: {},
  getSupportedBiometryType: jest.fn(async () => null),
  hasInternetCredentials: jest.fn(async () => false),
  setInternetCredentials: jest.fn(async () => undefined),
  getInternetCredentials: jest.fn(async () => false),
  resetInternetCredentials: jest.fn(async () => undefined),
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

jest.mock('react-native-gifted-charts', () => ({
  BarChart: 'BarChart',
  LineChart: 'LineChart',
  PieChart: 'PieChart',
}));

// lucide-react-native ships ESM icon modules Jest doesn't transform; stub every
// named icon export with a simple component.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'Icon' }));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const MapView = (props) => React.createElement('MapView', props, props.children);
  const Marker = (props) => React.createElement('Marker', props, props.children);
  return { __esModule: true, default: MapView, MapView, Marker };
});
