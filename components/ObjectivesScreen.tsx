// components/ObjectivesScreen.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  ScrollView, TextInput, Alert
} from 'react-native'
import { supabase } from '../lib/supabase'

type ObjStatus = 'pending' | 'completed' | 'canceled'
type Objective = {
  id: string
  client_name: string
  objective: string
  status: ObjStatus
  assigned_date: string | null
  due_date: string | null
  updated_by: string | null
}

type Props = {
  onBack?: () => void
  currentUser?: { id: string; username: string }
}

export default function ObjectivesScreen({ onBack, currentUser }: Props) {
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<Objective[]>([])
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | ObjStatus>('all')

  // detail modal
  const [selected, setSelected] = useState<Objective | null>(null)

  // add modal
  const [showAdd, setShowAdd] = useState(false)
  const [newClient, setNewClient] = useState('')
  const [newObjective, setNewObjective] = useState('')
  const [newDue, setNewDue] = useState('') // YYYY-MM-DD optional

  const username = currentUser?.username ?? 'hussein'

  const load = async () => {
    setLoading(true); setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('objectives')
        .select('id, client_name, objective, status, assigned_date, due_date, updated_by')
        .order('status', { ascending: true })
        .order('client_name', { ascending: true })

      if (error) throw error

      const mapped: Objective[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        client_name: String(r.client_name ?? '—'),
        objective: String(r.objective ?? '—'),
        status: (r.status ?? 'pending') as ObjStatus,
        assigned_date: r.assigned_date ?? null,
        due_date: r.due_date ?? null,
        updated_by: r.updated_by ?? null,
      }))
      setRows(mapped)
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load objectives.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const t = q.toLowerCase()
    return rows.filter(r => {
      const matchesText =
        !t ||
        r.client_name.toLowerCase().includes(t) ||
        r.objective.toLowerCase().includes(t)
      const matchesTab = tab === 'all' || r.status === tab
      return matchesText && matchesTab
    })
  }, [rows, q, tab])

  // Only move forward (no revert to pending)
  const setStatus = async (id: string, status: Extract<ObjStatus, 'completed' | 'canceled'>) => {
    try {
      setRows(prev => prev.map(r => r.id === id ? { ...r, status, updated_by: username } : r))
      const { error } = await supabase
        .from('objectives')
        .update({ status, updated_by: username })
        .eq('id', id)
      if (error) throw error
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? 'Could not update status')
      await load()
    }
  }

  const openAdd = () => {
    setNewClient('')
    setNewObjective('')
    setNewDue('')
    setShowAdd(true)
  }

  const addObjective = async () => {
    const client = newClient.trim()
    const obj = newObjective.trim()
    const due = newDue.trim()

    if (!client || !obj) {
      Alert.alert('Missing', 'Client and objective are required.')
      return
    }
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      Alert.alert('Invalid date', 'Due date must be YYYY-MM-DD or empty.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('objectives')
        .insert({
          client_name: client,
          objective: obj,
          status: 'pending',
          due_date: due || null,
          updated_by: username,
        })
        .select('id, client_name, objective, status, assigned_date, due_date, updated_by')
        .single()

      if (error) throw error

      const r = data as any
      const inserted: Objective = {
        id: String(r.id),
        client_name: String(r.client_name ?? client),
        objective: String(r.objective ?? obj),
        status: (r.status ?? 'pending') as ObjStatus,
        assigned_date: r.assigned_date ?? null,
        due_date: r.due_date ?? (due || null),
        updated_by: r.updated_by ?? username,
      }

      setRows(prev => [inserted, ...prev])
      setShowAdd(false)
    } catch (e: any) {
      console.error('add objective error', e)
      Alert.alert('Insert failed', e?.message ?? 'Could not add objective.')
    }
  }

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Assess Prospects Objectives</Text>
        <Pressable onPress={openAdd} style={styles.addTopBtn}>
          <Text style={styles.addTopTxt}>+ Add</Text>
        </Pressable>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search client or objective…"
          placeholderTextColor="#9aa0a6"
          style={styles.search}
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
          {(['all','pending','completed','canceled'] as const).map(s => (
            <Pressable
              key={s}
              onPress={() => setTab(s)}
              style={[styles.pill, tab === s ? styles.pillOn : styles.pillOff]}
            >
              <Text style={tab === s ? styles.pillTxtOn : styles.pillTxtOff}>
                {s.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ padding: 18, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading objectives…</Text>
        </View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{errorMsg}</Text>
          <Pressable onPress={load} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#111827', fontWeight: '800' }}>No objectives match.</Text>
          <Text style={{ color: '#6b7280', marginTop: 6 }}>Adjust filters or add data.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {filtered.map(o => (
              <Pressable key={o.id} onPress={() => setSelected(o)} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.client} numberOfLines={1}>{o.client_name}</Text>
                  <Text style={styles.objective} numberOfLines={3}>{o.objective}</Text>

                  <View style={styles.metaRow}>
                    {o.assigned_date && (
                      <View style={styles.metaPill}><Text style={styles.metaTxt}>Assigned: {o.assigned_date}</Text></View>
                    )}
                    {o.due_date && (
                      <View style={styles.metaPill}><Text style={styles.metaTxt}>Due: {o.due_date}</Text></View>
                    )}
                    {o.updated_by && (
                      <View style={styles.metaPill}><Text style={styles.metaTxt}>By {o.updated_by}</Text></View>
                    )}
                  </View>
                </View>

                <StatusChip status={o.status} />

                <View style={styles.actions}>
                  {o.status !== 'completed' && (
                    <Pressable onPress={() => setStatus(o.id, 'completed')} style={[styles.actBtn, styles.btnSuccess]}>
                      <Text style={styles.btnSuccessText}>Mark Completed</Text>
                    </Pressable>
                  )}
                  {o.status !== 'canceled' && (
                    <Pressable onPress={() => setStatus(o.id, 'canceled')} style={[styles.actBtn, styles.btnWarn]}>
                      <Text style={styles.btnWarnText}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
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
              <StatusChip status={selected.status} />
              <Pressable onPress={() => setSelected(null)} style={[styles.closeBtn, { marginLeft: 8 }]}>
                <Text style={styles.closeTxt}>✕</Text>
              </Pressable>
            </View>

            {/* meta chips */}
            <View style={styles.metaRow}>
              {selected.assigned_date && (
                <View style={styles.metaPill}><Text style={styles.metaPillTxt}>Assigned: {selected.assigned_date}</Text></View>
              )}
              {selected.due_date && (
                <View style={[styles.metaPill, { backgroundColor: '#eef2ff' }]}>
                  <Text style={[styles.metaPillTxt, { color: '#1d4ed8' }]}>Due: {selected.due_date}</Text>
                </View>
              )}
              {selected.updated_by && (
                <View style={styles.metaPill}><Text style={styles.metaPillTxt}>By {selected.updated_by}</Text></View>
              )}
              <View style={styles.metaPill}><Text style={styles.metaPillTxt}>ID: {selected.id.slice(0,8)}…</Text></View>
            </View>

            {/* objective text */}
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Objective</Text>
              <ScrollView style={{ maxHeight: 240 }}>
                <Text style={styles.notesFull}>{selected.objective || '—'}</Text>
              </ScrollView>
            </View>

            {/* footer */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setSelected(null)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Add Objective Modal */}
      {showAdd && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Objective</Text>
            <Text style={styles.modalSub}>New objectives start as <Text style={{ fontWeight: '900' }}>PENDING</Text>.</Text>

            <Text style={styles.inputLabel}>Client name*</Text>
            <TextInput
              value={newClient}
              onChangeText={setNewClient}
              placeholder="Dr. Jane Doe / Pharmacy ABC"
              placeholderTextColor="#9aa0a6"
              style={styles.textInput}
            />

            <Text style={styles.inputLabel}>Objective*</Text>
            <TextInput
              value={newObjective}
              onChangeText={setNewObjective}
              placeholder="Describe the objective…"
              placeholderTextColor="#9aa0a6"
              multiline
              style={[styles.textInput, { minHeight: 80, textAlignVertical: 'top' }]}
            />

            <Text style={styles.inputLabel}>Due date (YYYY-MM-DD)</Text>
            <TextInput
              value={newDue}
              onChangeText={setNewDue}
              placeholder="2025-11-01"
              placeholderTextColor="#9aa0a6"
              style={styles.textInput}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Pressable onPress={() => setShowAdd(false)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addObjective} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function StatusChip({ status }: { status: ObjStatus }) {
  const map: any = {
    pending:   { bg: '#fff7ed', fg: '#9a3412', text: 'PENDING' },
    completed: { bg: '#dcfce7', fg: '#065f46', text: 'COMPLETED' },
    canceled:  { bg: '#fee2e2', fg: '#991b1b', text: 'CANCELED' },
  }
  const s = map[status] || map.pending
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: s.bg }}>
      <Text style={{ color: s.fg, fontWeight: '800', fontSize: 12 }}>{s.text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  textInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f2f4f7',
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 15,
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 4,
  },

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
  addTopBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  addTopTxt: { color: '#fff', fontWeight: '800' },

  controls: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0f5',
  },
  search: {
    height: 42, backgroundColor: '#f2f4f7', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, color: '#111827',
  },

  card: {
    width: '100%', maxWidth: 520,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5',
    padding: 14, gap: 10,
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },

  client: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  objective: { fontSize: 13, color: '#111827' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  metaTxt: { color: '#111827', fontWeight: '800', fontSize: 12 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  actBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center'
  },
  btnSuccess:{ borderColor: '#16a34a', backgroundColor: '#16a34a' },
  btnWarn:   { borderColor: '#f59e0b', backgroundColor: '#f59e0b' },

  btnSuccessText:{ color: '#fff', fontWeight: '800' },
  btnWarnText:   { color: '#fff', fontWeight: '800' },

  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff' },
  btnGhostText: { color: '#111827', fontWeight: '800' },

  pill: {
    height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center'
  },
  pillOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillOff:{ backgroundColor: '#fff',    borderColor: '#e5e7eb' },
  pillTxtOn: { color: '#fff',     fontWeight: '800' },
  pillTxtOff:{ color: '#111827',  fontWeight: '800' },

  /* modal */
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

  metaPillTxt: { color: '#111827', fontWeight: '800', fontSize: 12 },

  notesBox: {
    borderRadius: 14, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#f9fafb', padding: 12,
  },
  notesLabel: { fontSize: 12, color: '#6b7280', fontWeight: '700', marginBottom: 6 },
  notesFull: { fontSize: 14, color: '#0f172a', lineHeight: 20 },

  closeBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  closeTxt: { fontSize: 16, color: '#111827', fontWeight: '800' },

  modalSub: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    fontWeight: '400',
  },
})
