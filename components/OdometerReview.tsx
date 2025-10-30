// components/OdometerReview.tsx
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, Pressable } from 'react-native'
import { supabase } from '../lib/supabase'

type Props = {
  onBack?: () => void
  currentUser?: { id: string; username: string }
}

type OdoRow = {
  id: string
  username: string
  visit_id: string | null
  kind: 'start' | 'end' | string
  photo_url: string
  created_at: string
}

export default function OdometerReview({ onBack, currentUser }: Props) {
  const username = (currentUser?.username ?? '').trim()
  const [rows, setRows] = useState<OdoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      let q = supabase.from('odometer').select('*').order('created_at', { ascending: false })
      if (username) q = q.eq('username', username)
      const { data, error } = await q
      if (error) throw error
      setRows((data ?? []).map((r: any) => ({
        id: String(r.id), username: String(r.username),
        visit_id: r.visit_id ? String(r.visit_id) : null,
        kind: r.kind, photo_url: String(r.photo_url), created_at: String(r.created_at)
      })))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load odometer photos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [username])

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Odometer Review</Text>
        <View style={{ width: 8 }} />
      </View>

      {loading ? (
        <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator /></View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{error}</Text>
          <Pressable onPress={load} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#6b7280' }}>No odometer photos{username ? ` for ${username}` : ''}.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {rows.map((r) => (
            <View key={r.id} style={styles.card}>
              <Image source={{ uri: r.photo_url }} style={styles.photo} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.kind.toUpperCase()} • {new Date(r.created_at).toLocaleString()}</Text>
                <Text style={styles.cardSub}>User: {r.username}{r.visit_id ? ` • Visit: ${r.visit_id}` : ''}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },
  appBar: {
    paddingTop: 18, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f5',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
  },
  backBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { fontSize: 18, textAlign: 'center', fontWeight: '800', color: '#0f172a', flex: 1 },

  card: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: '#eef0f3', backgroundColor: '#fff', padding: 10,
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
  },
  photo: { width: 140, height: 90, borderRadius: 10, backgroundColor: '#e5e7eb' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#475569', marginTop: 2 },

  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
})
