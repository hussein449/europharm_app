// components/EndJourneyReport.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native'
import { supabase } from '../lib/supabase'

type VisitRow = {
  id: string
  visit_date: string // YYYY-MM-DD
  client_name: string
  visited_by: string | null
  status: string | null
  note_type: 'SALES ORDER' | 'RFR' | 'COLLECTION' | string | null
  notes: string | null
  /** DB column is singular */
  sample_distributed: number | null
}

type Props = {
  onBack?: () => void
  currentUser?: { id: string; username: string }
}

/* --- helpers --- */
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isValidISO(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  // ensure same components (avoid JS Date auto-fix like 2025-13-40 → 2026-02-09)
  return toISO(d) === dateStr
}
function avatarEmojiFor(u: string) {
  const pool = ['🧭','🧪','📦','💊','🧴','📍','🚗','📋','🧾','📈']
  if (!u || u === '(unknown)') return '👤'
  let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) % 997
  return pool[h % pool.length]
}
function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillOn : styles.pillOff]}>
      <Text style={active ? styles.pillTxtOn : styles.pillTxtOff}>{label}</Text>
    </Pressable>
  )
}

/** Parse "Samples:" lines out of notes → { cleanNotes, items[], total } */
function parseSamplesFromNotes(notesRaw: string | null) {
  const notes = (notesRaw ?? '').trim()
  if (!notes) return { cleanNotes: '', items: [] as { name: string; qty: number }[], total: 0 }

  const lines = notes.split(/\r?\n/)
  const sampleLines: string[] = []
  const otherLines: string[] = []

  for (const ln of lines) {
    if (/^\s*samples\s*[:\-]/i.test(ln)) sampleLines.push(ln)
    else otherLines.push(ln)
  }

  const items: { name: string; qty: number }[] = []
  for (const s of sampleLines) {
    const body = s.replace(/^\s*samples\s*[:\-]\s*/i, '')
    const tokens = body.split(/[;,]/).map(t => t.trim()).filter(Boolean)
    for (const tok of tokens) {
      const m = tok.match(/^([\p{L}\p{N}\s.'\-_/()]+?)\s*(?:[x×]\s*)?(\d+)$/u)
      if (m) {
        const name = m[1].trim().replace(/\s+/g, ' ')
        const qty = parseInt(m[2], 10)
        if (name && Number.isFinite(qty)) items.push({ name, qty })
      } else {
        const m2 = tok.match(/^(.+?)\s+(\d+)$/)
        if (m2) {
          const name2 = m2[1].trim()
          const qty2 = parseInt(m2[2], 10)
          if (name2 && Number.isFinite(qty2)) items.push({ name: name2, qty: qty2 })
        }
      }
    }
  }

  const total = items.reduce((s, it) => s + (it.qty || 0), 0)
  const cleanNotes = otherLines.join('\n').trim()
  return { cleanNotes, items, total }
}

export default function EndJourneyReport({ onBack, currentUser }: Props) {
  const today = new Date()
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  // editable inputs
  const [startDate, setStartDate] = useState(toISO(startMonth))
  const [endDate, setEndDate] = useState(toISO(today))
  const [preset, setPreset] = useState<'month' | 'week' | null>('month')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState<VisitRow[]>([])

  const [openUser, setOpenUser] = useState<string | null>(null)
  const [search, setSearch] = useState('') // hidden in scoped view
  const [selected, setSelected] = useState<VisitRow | null>(null)

  const username = (currentUser?.username ?? '').trim() || null
  const showSearch = false

  const normalize = (data: any[]): VisitRow[] =>
    (data ?? []).map((r: any) => {
      const sd = r.sample_distributed
      const normalizedSample: number | null =
        typeof sd === 'number' && Number.isFinite(sd) ? sd : null // PRESERVE null vs 0; don't coerce null→0
      return {
        id: String(r.id),
        visit_date: String(r.visit_date ?? '').slice(0, 10),
        client_name: String(r.client_name ?? '—'),
        visited_by: r.visited_by ?? null,
        status: r.status ?? null,
        note_type: r.note_type ?? null,
        notes: r.notes ?? null,
        sample_distributed: normalizedSample,
      }
    })

  const load = async (range?: { start: string; end: string }) => {
    const useStart = range?.start ?? startDate
    const useEnd = range?.end ?? endDate

    setLoading(true)
    try {
      if (!username) {
        setRows([])
        return
      }

      const base = supabase
        .from('visits')
        .select('id, visit_date, client_name, visited_by, status, note_type, notes, sample_distributed')
        .gte('visit_date', useStart)
        .lte('visit_date', useEnd)
        .order('visit_date', { ascending: false })

      const { data: mine, error: errMine } = await base.eq('visited_by', username)
      if (errMine) throw errMine

      if (mine && mine.length > 0) {
        setRows(normalize(mine))
        return
      }

      const { data: legacy, error: errLegacy } = await base.is('visited_by', null)
      if (errLegacy) throw errLegacy

      setRows(normalize(legacy || []))
    } catch (e: any) {
      console.error('report load error:', e)
      Alert.alert('Load failed', e?.message ?? 'Could not load end-journey report.')
    } finally {
      setLoading(false)
    }
  }

  // Initial load when user is known
  useEffect(() => {
    if (username) load({ start: startDate, end: endDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  const applyPreset = async (p: 'month' | 'week') => {
    setPreset(p)
    if (p === 'month') {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      const start = toISO(s)
      const end = toISO(today)
      setStartDate(start)
      setEndDate(end)
      await load({ start, end })
    } else {
      const day = today.getDay() === 0 ? 7 : today.getDay() // Mon=1..Sun=7
      const monday = new Date(today); monday.setDate(today.getDate() - (day - 1))
      const start = toISO(monday)
      const end = toISO(today)
      setStartDate(start)
      setEndDate(end)
      await load({ start, end })
    }
  }

  const applyDates = async () => {
    const s = startDate.trim()
    const e = endDate.trim()

    if (!isValidISO(s) || !isValidISO(e)) {
      Alert.alert('Invalid date', 'Please use YYYY-MM-DD for both start and end.')
      return
    }

    let start = s
    let end = e
    if (new Date(start) > new Date(end)) {
      // swap to be helpful
      const tmp = start
      start = end
      end = tmp
      setStartDate(start)
      setEndDate(end)
    }

    setPreset(null) // custom range
    await load({ start, end })
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // Group by visited_by
  const byUser = useMemo(() => {
    const m = new Map<string, VisitRow[]>()
    for (const r of rows) {
      const key = r.visited_by ?? '(unknown)'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return m
  }, [rows])

  // totals per user (DB field OR parsed) — prefer DB when not null, else parsed
  const totals = useMemo(() => {
    const obj: Record<string, { visits: number; samples: number }> = {}
    for (const [u, list] of byUser.entries()) {
      obj[u] = {
        visits: list.length,
        samples: list.reduce((sum, v) => {
          const parsed = parseSamplesFromNotes(v.notes)
          const eff = v.sample_distributed != null ? v.sample_distributed : parsed.total
          return sum + (eff || 0)
        }, 0),
      }
    }
    return obj
  }, [byUser])

  // visible user keys (search disabled in scoped view)
  const users = useMemo(() => {
    const all = Array.from(byUser.keys())
    const q = search.trim().toLowerCase()
    const filtered = q ? all.filter(u => (u ?? '').toLowerCase().includes(q)) : all
    return filtered.sort((a, b) => a.localeCompare(b))
  }, [byUser, search])

  return (
    <View style={styles.screen}>
      {/* App bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>End Journey Report</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filters */}
      <View style={styles.filtersWrap}>
        <View style={styles.pills}>
          <Pill label="This Month" active={preset === 'month'} onPress={() => applyPreset('month')} />
          <Pill label="This Week" active={preset === 'week'} onPress={() => applyPreset('week')} />
        </View>

        {/* Editable date range */}
        <View style={styles.datesRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Start (YYYY-MM-DD)</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9aa0a6"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>End (YYYY-MM-DD)</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9aa0a6"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={applyDates} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
            <Text style={styles.btnPrimaryText}>Apply</Text>
          </Pressable>
        </View>

        {/* Optional search (kept hidden when scoped) */}
        {false && showSearch && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.inputLabel}>Search by username</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="e.g. hussein"
              placeholderTextColor="#9aa0a6"
              style={styles.input}
            />
          </View>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyTitle}>No journeys in the selected range</Text>
          <Text style={styles.emptySub}>Try changing the range or preset.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {users.map((u) => {
            const head = u === '(unknown)' ? 'Unknown user' : `@${u}`
            const t = totals[u] || { visits: 0, samples: 0 }
            const open = openUser === u

            return (
              <View key={u} style={styles.userCard}>
                {/* Header / summary */}
                <Pressable onPress={() => setOpenUser(open ? null : u)} style={styles.userHeader}>
                  <View style={styles.userAvatar}><Text style={{ fontSize: 18 }}>{avatarEmojiFor(u)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userTitle} numberOfLines={1}>{head}</Text>
                    <Text style={styles.userSub} numberOfLines={1}>
                      {t.visits} {t.visits === 1 ? 'visit' : 'visits'} • {t.samples} sample{t.samples === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={[styles.kpi, styles.kpiBlue]}>
                    <Text style={styles.kpiVal}>{t.samples}</Text>
                    <Text style={styles.kpiLbl}>Samples</Text>
                  </View>
                  <View style={[styles.kpi, styles.kpiGreen]}>
                    <Text style={styles.kpiVal}>{t.visits}</Text>
                    <Text style={styles.kpiLbl}>Visits</Text>
                  </View>
                  <Text style={styles.chev}>{open ? '▴' : '▾'}</Text>
                </Pressable>

                {/* Body: visits list */}
                {open && (
                  <View style={{ paddingHorizontal: 8, paddingBottom: 10 }}>
                    {byUser.get(u)!.map(v => {
                      const parsed = parseSamplesFromNotes(v.notes)
                      // FIX: prefer DB value when not null, else parsed total
                      const effectiveTotal = v.sample_distributed != null ? v.sample_distributed : parsed.total
                      const hasSamples = (effectiveTotal || 0) > 0
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => setSelected(v)}
                          style={styles.visitRow}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.visitTitle} numberOfLines={1}>{v.client_name}</Text>
                            <Text style={styles.visitSub} numberOfLines={1}>
                              {v.visit_date} {v.note_type ? `• ${v.note_type}` : ''} {v.status ? `• ${v.status.toUpperCase()}` : ''}
                            </Text>
                            {!!v.notes && <Text style={styles.visitNotes} numberOfLines={2}>{parseSamplesFromNotes(v.notes).cleanNotes || '—'}</Text>}
                          </View>
                          <View style={[
                            styles.sampleBadge,
                            hasSamples ? styles.sampleYes : styles.sampleNo
                          ]}>
                            <Text style={hasSamples ? styles.sampleYesTxt : styles.sampleNoTxt}>
                              {hasSamples ? `${effectiveTotal} samples` : 'No samples'}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })}

          <View style={{ height: 28 }} />
        </ScrollView>
      )}

      {/* Visit details modal */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Visit Details</Text>
            {selected ? (() => {
              const parsed = parseSamplesFromNotes(selected.notes)
              // FIX: prefer DB value when not null, else parsed total
              const effectiveTotal = selected.sample_distributed != null ? selected.sample_distributed : parsed.total
              return (
                <View style={{ gap: 8 }}>
                  <DetailRow label="Client" value={selected.client_name || '—'} />
                  <DetailRow label="Date" value={selected.visit_date || '—'} />
                  <DetailRow label="Rep" value={selected.visited_by || '(unknown)'} />
                  <DetailRow label="Status" value={selected.status?.toUpperCase() || '—'} />
                  <DetailRow label="Type" value={selected.note_type || '—'} />
                  <DetailRow label="Samples Total" value={String(effectiveTotal)} />

                  <Text style={styles.inputLabel}>Samples Given</Text>
                  {parsed.items.length > 0 ? (
                    <View style={styles.samplesList}>
                      {parsed.items.map((it, idx) => (
                        <View key={idx} style={styles.sampleItem}>
                          <Text style={styles.sampleItemName}>{it.name}</Text>
                          <Text style={styles.sampleItemQty}>×{it.qty}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.samplesList}>
                      <Text style={{ color: '#64748b' }}>—</Text>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Notes</Text>
                  <View style={styles.notesBox}>
                    <Text style={{ color: '#0f172a' }}>{parsed.cleanNotes || '—'}</Text>
                  </View>
                </View>
              )
            })() : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable onPress={() => setSelected(null)} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnPrimaryText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

/* --- small presentational bits --- */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Text style={{ color: '#0f172a', fontWeight: '700' }}>{value}</Text>
    </View>
  )
}

/* --- styles --- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  appBar: {
    paddingTop: 18, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6',
  },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },

  filtersWrap: { padding: 16, paddingBottom: 8 },
  pills: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pill: { height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillOff: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  pillTxtOn: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pillTxtOff: { color: '#0f172a', fontWeight: '800', fontSize: 12 },

  datesRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 4 },
  inputLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: '700' },
  input: {
    height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 10, backgroundColor: '#f9fafb', color: '#0f172a',
  },

  list: { paddingHorizontal: 16, paddingVertical: 8 },

  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf0f5',
    marginBottom: 12,
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  userHeader: {
    padding: 12, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc',
    borderBottomWidth: 1, borderBottomColor: '#eef2f7',
  },
  userAvatar: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: '#e5f0ff',
    alignItems: 'center', justifyContent: 'center',
  },
  userTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  userSub: { fontSize: 12, color: '#475569', marginTop: 2 },

  kpi: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, alignItems: 'center', minWidth: 70, marginLeft: 6 },
  kpiVal: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  kpiLbl: { fontSize: 11, color: '#64748b', fontWeight: '800' },
  kpiBlue: { backgroundColor: '#e0e7ff' },
  kpiGreen: { backgroundColor: '#dcfce7' },
  chev: { marginLeft: 8, fontSize: 16, color: '#0f172a', fontWeight: '900' },

  visitRow: {
    marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eef0f3', backgroundColor: '#fff',
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  visitTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  visitSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  visitNotes: { fontSize: 12, color: '#111827', marginTop: 4 },

  sampleBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  sampleYes: { backgroundColor: '#ecfeff', borderColor: '#a5f3fc' },
  sampleNo: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  sampleYesTxt: { color: '#0e7490', fontWeight: '900', fontSize: 12 },
  sampleNoTxt: { color: '#475569', fontWeight: '800', fontSize: 12 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 42, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a', textAlign: 'center' },
  emptySub: { marginTop: 6, fontSize: 12, color: '#64748b', textAlign: 'center' },

  /* Modal */
  modalOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#eef0f3', padding: 16, gap: 8,
    // @ts-ignore rn-web
    boxShadow: '0 16px 40px rgba(2,8,23,0.2)',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },

  notesBox: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 10, backgroundColor: '#f9fafb',
  },

  samplesList: {
    borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 10, backgroundColor: '#f9fafb', gap: 6,
  },
  sampleItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sampleItemName: { color: '#0f172a', fontWeight: '700' },
  sampleItemQty: { color: '#0f172a', fontWeight: '900' },
})
