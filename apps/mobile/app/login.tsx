import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store';
import * as Haptics from 'expo-haptics';

/**
 * Login screen component.
 */
export default function LoginScreen() {
  const { serverUrl, setServerUrl, setAuth, setCurrentWorkspace } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(serverUrl);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setAuth(data.token, data.user);
      if (data.workspace) {
        setCurrentWorkspace(data.workspace);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', error.message || 'Please check your credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Ionicons name="flash" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>PulseWeave</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Server config toggle */}
        <TouchableOpacity
          style={styles.serverToggle}
          onPress={() => setShowServerConfig(!showServerConfig)}
        >
          <Ionicons name="server-outline" size={16} color="#71717a" />
          <Text style={styles.serverToggleText}>
            {showServerConfig ? 'Hide server settings' : 'Configure server'}
          </Text>
        </TouchableOpacity>

        {/* Server config */}
        {showServerConfig && (
          <View style={styles.serverConfig}>
            <Text style={styles.label}>Server URL</Text>
            <View style={styles.serverInputRow}>
              <TextInput
                style={[styles.input, styles.serverInput]}
                value={tempServerUrl}
                onChangeText={setTempServerUrl}
                placeholder="http://localhost:9090"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => {
                  setServerUrl(tempServerUrl);
                  setShowServerConfig(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Login form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#71717a"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#71717a"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Don't have an account? Contact your admin
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#71717a',
  },
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  serverToggleText: {
    fontSize: 14,
    color: '#71717a',
  },
  serverConfig: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  serverInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  serverInput: {
    flex: 1,
    marginBottom: 0,
  },
  saveButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d4d4d8',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  loginButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#71717a',
    fontSize: 14,
  },
});
