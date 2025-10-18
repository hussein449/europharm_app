import { useRef, useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Platform, Animated, Easing,
} from 'react-native'
import { supabase } from '../europharm_app/lib/supabase'
import type { AppUser } from './App' // keep pointing to wherever AppUser lives

// Make a friendly name from whatever your RPC returns
function deriveDisplayName(u: any, fallbackUsername: string): string {
  const tryFields = [
    u?.full_name,
    u?.name,
    u?.display_name,
    (u?.first_name && u?.last_name) ? `${u.first_name} ${u.last_name}` : undefined,
    u?.first_name,
    u?.username,
    u?.email,
    u?.phone,
  ].filter(Boolean)
  const pick = (tryFields[0] ?? fallbackUsername ?? 'User').toString().trim()
  return pick || 'User'
}

type NoticeKind = 'success' | 'info'

export default function LoginScreen({ onSuccess }: { onSuccess: (u: AppUser & { display_name?: string }) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // sleek inline notice (under the inputs)
  const [notice, setNotice] = useState<{ visible: boolean; message: string; kind: NoticeKind }>({
    visible: false, message: '', kind: 'info',
  })
  const anim = useRef(new Animated.Value(0)).current
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = (message: string, kind: NoticeKind = 'info', ms = 1800) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setNotice({ visible: true, message, kind })
    Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()
    hideTimer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true })
        .start(() => setNotice(n => ({ ...n, visible: false })))
    }, ms)
  }

  const onLogin = async () => {
    if (!username || !password) {
      showNotice('Enter both username and password.', 'info')
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
        const u = data[0] as any
        const displayName = deriveDisplayName(u, username)
        showNotice(`Welcome, ${displayName}!`, 'success', 1200)

        const enriched: AppUser & { display_name?: string } = { ...(u as AppUser), display_name: displayName }
        onSuccess(enriched)
      } else {
        // Wrong creds (but RPC ok). Not red; calm info tone.
        showNotice('Incorrect username or password.', 'info')
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Login failed'
      showNotice(msg, 'info')
      // Optional extra detail pop on non-Android
      if (Platform.OS !== 'android') Alert.alert('Login failed', msg)
    } finally {
      setLoading(false)
    }
  }

  // animated styles
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })
  const opacity = anim

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

        {/* Inline notice under entries (modern, non-red) */}
        {notice.visible && (
          <Animated.View
            style={[
              styles.notice,
              notice.kind === 'success' ? styles.noticeSuccess : styles.noticeInfo,
              { opacity, transform: [{ translateY }] },
            ]}
          >
            <Text style={styles.noticeIcon}>{notice.kind === 'success' ? '✓' : 'ℹ︎'}</Text>
            <Text style={styles.noticeText} numberOfLines={2}>{notice.message}</Text>
          </Animated.View>
        )}

        <Pressable onPress={onLogin} disabled={loading} style={[styles.button, loading && { opacity: 0.85 }]}>
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

  // sleek inline notice
  notice: {
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    // @ts-ignore rn-web
    boxShadow: '0 8px 22px rgba(0,0,0,0.06)',
  },
  noticeSuccess: {
    backgroundColor: '#eefdf5', // minty, not neon
    borderColor: '#c7f3de',
  },
  noticeInfo: {
    backgroundColor: '#eef2ff', // soft indigo
    borderColor: '#dbe3ff',
  },
  noticeIcon: { fontSize: 14, color: '#0f172a', opacity: 0.8 },
  noticeText: { color: '#0f172a', fontWeight: '700', flex: 1, lineHeight: 18 },

  button: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  hint: { color: '#6b7280', fontSize: 12, marginTop: 12 },
  hintAccent: { color: '#2563eb' },
})
