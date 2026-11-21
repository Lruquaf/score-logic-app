import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock'
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext)
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true, isInternetReachable: true }) }))
jest.mock('expo-linking', () => ({ addEventListener: () => ({ remove() {} }), getInitialURL: async () => null, openURL: jest.fn() }))

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }))
