import { useRef, useState } from 'react'
import {
  View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Platform, Animated, Easing,
} from 'react-native'
// 🚨 Make sure this import path is the SAME one you used on the page where the table read worked
// If your working path was "../lib/supabase", switch to that.
import { supabase } from '../europharm_app/lib/supabase'
import bcrypt from 'bcryptjs'

// If you don’t have a central AppUser type available here, uncomment this:
/*
type AppUser = {
  id: string
  username: string
  password_hash: string | null
  created_at: string | null
  full_name?: string | null
  name?: string | null
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
}
*/

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

export default function LoginScreen({
  onSuccess,
}: {
  onSuccess: (u: any /* AppUser */ & { display_name?: string }) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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

  async function tryRpcLogin(u: string, p: string) {
    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_username: u,
        p_password: p,
      })
      if (error) {
        if (__DEV__) console.log('[RPC] login_user error:', error)
        return { ok: false as const, reason: 'rpc_error', error }
      }
      if (Array.isArray(data) && data.length === 1) {
        if (__DEV__) console.log('[RPC] success row:', data[0])
        return { ok: true as const, row: data[0] }
      }
      if (__DEV__) console.log('[RPC] no match (empty/array!=1):', data)
      return { ok: false as const, reason: 'no_match' }
    } catch (e: any) {
      if (__DEV__) console.log('[RPC] exception:', e)
      return { ok: false as const, reason: 'rpc_exception', error: e }
    }
  }

  async function tryDirectLogin(u: string, p: string) {
    try {
      // exact, trimmed match first
      let { data, error, status } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', u)
        .maybeSingle()

      // if nothing found, try case-insensitive (comment this block to force exact match only)
      if (!data && !error) {
        const ilike = await supabase
          .from('app_users')
          .select('*')
          .ilike('username', u)
          .limit(1)
        if (!ilike.error && ilike.data && ilike.data.length === 1) {
          data = ilike.data[0]
          status = 200
        }
      }

      if (error) {
        if (__DEV__) console.log('[SELECT] error:', { status, error })
        // Typical RLS issue
        if (error.code === '42501' || status === 403) {
          return { ok: false as const, reason: 'rls_forbidden', error }
        }
        return { ok: false as const, reason: 'select_error', error }
      }
      if (!data) {
        if (__DEV__) console.log('[SELECT] user not found for', u)
        return { ok: false as const, reason: 'user_not_found' }
      }

      // password_hash must exist
      const hash = (data as any).password_hash
      if (!hash || typeof hash !== 'string') {
        if (__DEV__) console.log('[SELECT] user has no password_hash:', data)
        return { ok: false as const, reason: 'no_hash' }
      }

      // client-side verify
      const match = await bcrypt.compare(p, hash)
      if (!match) {
        if (__DEV__) console.log('[BCRYPT] mismatch for', u)
        return { ok: false as const, reason: 'mismatch' }
      }

      if (__DEV__) console.log('[DIRECT] success row:', data)
      return { ok: true as const, row: data }
    } catch (e: any) {
      if (__DEV__) console.log('[DIRECT] exception:', e)
      return { ok: false as const, reason: 'direct_exception', error: e }
    }
  }

  const onLogin = async () => {
    const u = username.trim()
    const p = password

    if (!u || !p) {
      showNotice('Enter both username and password.', 'info')
      return
    }

    setLoading(true)
    try {
      // 1) Try server RPC
      const r1 = await tryRpcLogin(u, p)
      if (r1.ok) {
        const displayName = deriveDisplayName(r1.row, u)
        showNotice(`Welcome, ${displayName}!`, 'success', 1200)
        onSuccess({ ...r1.row, display_name: displayName })
        return
      }

      // 2) Fallback: direct + bcrypt
      const r2 = await tryDirectLogin(u, p)
      if (r2.ok) {
        const displayName = deriveDisplayName(r2.row, u)
        showNotice(`Welcome, ${displayName}!`, 'success', 1200)
        onSuccess({ ...r2.row, display_name: displayName })
        return
      }

      // Handle common failure reasons cleanly for the user, noisy in dev logs only
      if (__DEV__) console.log('[LOGIN FAIL] rpc:', r1, ' direct:', r2)

      if ((r1 as any).reason === 'rpc_error' || (r1 as any).reason === 'rpc_exception') {
        // If RPC blew up but direct path says RLS forbid, tell the truth
        if ((r2 as any).reason === 'rls_forbidden') {
          showNotice('Permission denied (RLS). Check SELECT policy on app_users.', 'info', 2600)
          if (Platform.OS !== 'android') {
            Alert.alert('RLS blocked', 'Your RLS is blocking SELECT on app_users for this client.')
          }
          return
        }
      }

      if ((r2 as any).reason === 'rls_forbidden') {
        showNotice('Permission denied (RLS). Check SELECT policy on app_users.', 'info', 2600)
        if (Platform.OS !== 'android') {
          Alert.alert('RLS blocked', 'Your RLS is blocking SELECT on app_users for this client.')
        }
        return
      }

      // Default calm message
      showNotice('Incorrect username or password.', 'info')
    } catch (e: any) {
      const msg = e?.message ?? 'Login failed'
      showNotice(msg, 'info')
      if (Platform.OS !== 'android') Alert.alert('Login failed', msg)
    } finally {
      setLoading(false)
    }
  }

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
    backgroundColor: '#eefdf5',
    borderColor: '#c7f3de',
  },
  noticeInfo: {
    backgroundColor: '#eef2ff',
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
