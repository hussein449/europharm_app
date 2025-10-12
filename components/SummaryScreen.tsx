// components/SummaryScreen.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView,
  RefreshControl, TextInput
} from 'react-native'
import { supabase } from '../lib/supabase'

type Visit = {
  id: string
  client_name: string
  visit_date: string // YYYY-MM-DD
  notes: string | null
  visited_by: string | null
  note_type: 'SALES ORDER' | 'RFR' | 'COLLECTION' | null
}

type Props = {
  onBack?: () => void
  currentUser?: { id: string; username: string }
}

export default function SummaryScreen({ onBack, currentUser }: Props) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Visit | null>(null) // <-- modal state

  const username = currentUser?.username ?? ''

  const load = async () => {
    if (!username) {
      setRows([]); setLoading(false)
      setError('No logged-in username found.')
      return
    }
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase
        .from('visits')
        .select('id, client_name, visit_date, notes, visited_by, status, note_type')
        .eq('status', 'done')
        .eq('visited_by', username)
        .order('visit_date', { ascending: false })

      if (error) throw error

      const normalized: Visit[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        client_name: String(r.client_name ?? '—'),
        visit_date: (r.visit_date ?? '').slice(0, 10),
        notes: r.notes ?? null,
        visited_by: r.visited_by ?? null,
        note_type: r.note_type ?? null,
      }))
      setRows(normalized)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load summary.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [username])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return rows
    const t = q.toLowerCase()
    return rows.filter(r =>
      r.client_name.toLowerCase().includes(t) ||
      (r.notes ?? '').toLowerCase().includes(t) ||
      r.visit_date.includes(t) ||
      (r.note_type ?? '').toLowerCase().includes(t)
    )
  }, [rows, q])

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>My Visit Notes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.controls}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by client, note, date, or type…"
          placeholderTextColor="#9aa0a6"
          style={styles.search}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ padding: 18, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading your visits…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{error}</Text>
          <Pressable onPress={load} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#111827', fontWeight: '800' }}>No completed visits found for you.</Text>
          <Text style={{ color: '#6b7280', marginTop: 6 }}>Finish a visit with a note, then refresh.</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        >
          {filtered.map(v => (
            <Pressable key={v.id} onPress={() => setSelected(v)} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.client} numberOfLines={1}>{v.client_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{v.visit_date}</Text>
                {v.note_type ? (
                  <View style={styles.typeChip}><Text style={styles.typeChipTxt}>{v.note_type}</Text></View>
                ) : null}
                {v.notes ? (
                  <Text style={styles.notes} numberOfLines={3}>{v.notes}</Text>
                ) : (
                  <Text style={[styles.notes, { fontStyle: 'italic', color: '#94a3b8' }]}>No note</Text>
                )}
              </View>
              <View style={styles.badge}><Text style={styles.badgeTxt}>DONE</Text></View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      {selected && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {/* header */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.modalTitle} numberOfLines={2}>{selected.client_name}</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>

            {/* meta row */}
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillTxt}>{selected.visit_date}</Text>
              </View>
              {selected.note_type ? (
                <View style={[styles.metaPill, { backgroundColor: '#eef2ff' }]}>
                  <Text style={[styles.metaPillTxt, { color: '#1d4ed8' }]}>{selected.note_type}</Text>
                </View>
              ) : null}
              {selected.visited_by ? (
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillTxt}>By {selected.visited_by}</Text>
                </View>
              ) : null}
            </View>

            {/* notes box */}
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                <Text style={styles.notesFull}>
                  {selected.notes && selected.notes.trim().length > 0 ? selected.notes : '—'}
                </Text>
              </ScrollView>
            </View>

            {/* footer */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setSelected(null)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Close</Text>
              </Pressable>
              {/* future: export/share button could go here */}
            </View>
          </View>
        </View>
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
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
  },
  backBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },

  controls: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f5',
  },
  search: {
    height: 42, backgroundColor: '#f2f4f7', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, color: '#111827',
  },

  card: {
    marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5',
    backgroundColor: '#fff', flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },
  client: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  typeChip: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#eef2ff',
  },
  typeChipTxt: { color: '#1d4ed8', fontWeight: '800', fontSize: 12 },

  notes: { fontSize: 13, color: '#111827', marginTop: 8 },

  badge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#dcfce7',
  },
  badgeTxt: { color: '#065f46', fontWeight: '800', fontSize: 12 },

  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff' },
  btnGhostText: { color: '#111827', fontWeight: '800' },

  /* Modal styles */
  modalOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, gap: 12,
    // @ts-ignore rn-web
    boxShadow: '0 18px 46px rgba(0,0,0,0.2)',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', flex: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  closeTxt: { fontSize: 16, color: '#111827', fontWeight: '800' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  metaPillTxt: { color: '#111827', fontWeight: '800', fontSize: 12 },

  notesBox: {
    borderRadius: 14, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#f9fafb', padding: 12,
  },
  notesLabel: { fontSize: 12, color: '#6b7280', fontWeight: '700', marginBottom: 6 },
  notesFull: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
})
