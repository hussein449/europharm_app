import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { supabase } from '../europharm_app/lib/supabase'; // keep your working path
import bcrypt from 'bcryptjs';

// ✅ IMPORT YOUR LOGO (adjust the relative path if needed)
import logo from './logo/logo.png';

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
  ].filter(Boolean);
  const pick = (tryFields[0] ?? fallbackUsername ?? 'User').toString().trim();
  return pick || 'User';
}

type NoticeKind = 'success' | 'info';

export default function LoginScreen({
  onSuccess,
}: {
  onSuccess: (u: any & { display_name?: string }) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState<{ visible: boolean; message: string; kind: NoticeKind }>(
    { visible: false, message: '', kind: 'info' }
  );
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (message: string, kind: NoticeKind = 'info', ms = 1800) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setNotice({ visible: true, message, kind });
    Animated.timing(anim, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(() => setNotice(n => ({ ...n, visible: false })));
    }, ms);
  };

  async function tryRpcLogin(u: string, p: string) {
    try {
      const { data, error } = await supabase.rpc('login_user', { p_username: u, p_password: p });
      if (error) return { ok: false as const, reason: 'rpc_error', error };
      if (Array.isArray(data) && data.length === 1) return { ok: true as const, row: data[0] };
      return { ok: false as const, reason: 'no_match' };
    } catch (e: any) {
      return { ok: false as const, reason: 'rpc_exception', error: e };
    }
  }

  async function tryDirectLogin(u: string, p: string) {
    try {
      let { data, error, status } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', u)
        .maybeSingle();

      if (!data && !error) {
        const ilike = await supabase.from('app_users').select('*').ilike('username', u).limit(1);
        if (!ilike.error && ilike.data && ilike.data.length === 1) {
          data = ilike.data[0];
          status = 200;
        }
      }

      if (error) {
        if (error.code === '42501' || status === 403) {
          return { ok: false as const, reason: 'rls_forbidden', error };
        }
        return { ok: false as const, reason: 'select_error', error };
      }
      if (!data) return { ok: false as const, reason: 'user_not_found' };

      const hash = (data as any).password_hash;
      if (!hash || typeof hash !== 'string') return { ok: false as const, reason: 'no_hash' };

      const match = await bcrypt.compare(p, hash);
      if (!match) return { ok: false as const, reason: 'mismatch' };

      return { ok: true as const, row: data };
    } catch (e: any) {
      return { ok: false as const, reason: 'direct_exception', error: e };
    }
  }

  const onLogin = async () => {
    const u = username.trim();
    const p = password;

    if (!u || !p) {
      showNotice('Enter both username and password.', 'info');
      return;
    }

    setLoading(true);
    try {
      const r1 = await tryRpcLogin(u, p);
      if (r1.ok) {
        const displayName = deriveDisplayName(r1.row, u);
        showNotice(`Welcome, ${displayName}!`, 'success', 1200);
        onSuccess({ ...r1.row, display_name: displayName });
        return;
      }

      const r2 = await tryDirectLogin(u, p);
      if (r2.ok) {
        const displayName = deriveDisplayName(r2.row, u);
        showNotice(`Welcome, ${displayName}!`, 'success', 1200);
        onSuccess({ ...r2.row, display_name: displayName });
        return;
      }

      if ((r2 as any).reason === 'rls_forbidden') {
        showNotice('Permission denied (RLS). Check SELECT policy on app_users.', 'info', 2600);
        if (Platform.OS !== 'android') {
          Alert.alert('RLS blocked', 'Your RLS is blocking SELECT on app_users for this client.');
        }
        return;
      }

      showNotice('Incorrect username or password.', 'info');
    } catch (e: any) {
      const msg = e?.message ?? 'Login failed';
      showNotice(msg, 'info');
      if (Platform.OS !== 'android') Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const opacity = anim;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {/* Logo block (matches web: large, rounded, ring, shadow) */}
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Title / subtitle */}
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <Text style={styles.brand}>New Europharm</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Username */}
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@example.com"
          placeholderTextColor="#9aa0a6"
          style={styles.input}
        />

        {/* Password */}
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

        {/* Submit */}
        <Pressable
          onPress={onLogin}
          disabled={loading}
          style={[styles.button, loading && { opacity: 0.85 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        {/* Footer */}
        <Text style={styles.footer}>
          © {new Date().getFullYear()} New Europharm. All rights reserved.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Background approximates the web gradient with a soft two-tone
  root: {
    flex: 1,
    backgroundColor: '#f3f6fb', // from-slate-50 to-slate-100 feel
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Card container
  card: {
    width: '100%',
    maxWidth: 440,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.8)', // ring-slate-200/60
    // @ts-ignore rn-web
    boxShadow: '0 12px 28px rgba(2, 6, 23, 0.08)',
  },

  // Logo wrapper to mimic big rounded square with ring and subtle shadow
  logoWrap: {
    alignSelf: 'center',
    height: 112, // h-28
    width: 112,  // w-28
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    // @ts-ignore rn-web
    boxShadow: '0 2px 6px rgba(2, 6, 23, 0.06)',
    overflow: 'hidden',
  },
  logo: {
    height: 96, // h-24
    width: 96,  // w-24
  },

  brand: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
    fontSize: 13,
  },

  label: {
    color: '#334155',
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10, default: 12 }),
  },

  notice: {
    marginTop: 12,
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
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#4f46e5', // indigo-600
  },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },

  footer: {
    marginTop: 14,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 11,
  },
});
