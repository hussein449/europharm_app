// components/LoginScreen.tsx
import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet,
} from 'react-native'
import { supabase } from '../europharm_app/lib/supabase'
// import type { AppUser } from '../App'
// Update the import path below to the correct location of AppUser type:
import type { AppUser } from './App' // <-- Change './types' to the actual file where AppUser is defined

export default function LoginScreen({ onSuccess }: { onSuccess: (u: AppUser) => void }) {
  // All hooks live here; no early returns.
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const onLogin = async () => {
    if (!username || !password) {
      Alert.alert('Missing info', 'Enter both username and password.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_username: username,
        p_password: password,
      })
      if (error) throw error
      if (Array.isArray(data) && data.length === 1) {
        const u = data[0] as AppUser
        onSuccess(u) // -> App switches to Home
      } else {
        Alert.alert('Invalid credentials', 'Wrong username or password.')
      }
    } catch (e: any) {
      Alert.alert('Login failed', e.message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Europharm — Sign in</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="hussein"
          placeholderTextColor="#9aa0a6"
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 10 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#9aa0a6"
          style={styles.input}
        />

        <Pressable onPress={onLogin} disabled={loading} style={styles.button}>
          {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        <Text style={styles.hint}>
          Demo: <Text style={styles.hintAccent}>hussein / hussein</Text>
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eef0f3',
    // react-native-web warns for shadow*, so keep it minimal or switch to boxShadow:
    // @ts-ignore rn-web
    boxShadow: '0 6px 12px rgba(0,0,0,0.06)',
  },
  title: { color: '#111827', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  label: { color: '#6b7280', marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: '#f3f4f6',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  hint: { color: '#6b7280', fontSize: 12, marginTop: 12 },
  hintAccent: { color: '#2563eb' },
})
