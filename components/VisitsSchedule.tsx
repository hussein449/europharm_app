import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { startTracking, stopTracking, setCurrentVisitId } from '../lib/tracking'

type VisitRow = {
  id: string
  visit_date: string   // YYYY-MM-DD
  status: 'planned' | 'en_route' | 'done' | 'skipped' | string
  client_name: string
  specialty?: string | null
  area?: string | null
  notes?: string | null
  visited_by?: string | null
}

type UserLite = { id: string; username: string }
type Props = { onBack?: () => void; currentUser?: UserLite; onViewMap?: (visitId: string) => void }

export default function VisitsSchedule({ onBack, currentUser, onViewMap }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-11
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<VisitRow[]>([])
  const [selectedDay, setSelectedDay] = useState(toIsoDate(today))

  // journey state
  const [journeyMode, setJourneyMode] = useState(false)
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null)
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [summary, setSummary] = useState('')

  // add visit state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSpec, setNewSpec] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newDate, setNewDate] = useState(selectedDay)

  const range = monthRange(year, month)
  const daysGrid = useMemo(() => buildCalendarGrid(year, month), [year, month])

  const load = async () => {
    setLoading(true); setErrorMsg(null)
    try {
      let data: any[] | null = null
      const rpc = await supabase.rpc('get_visits_range', { p_start: range.start, p_end: range.end })
      if (!rpc.error && Array.isArray(rpc.data)) {
        data = rpc.data
      } else {
        const { data: sel, error } = await supabase
          .from('visits')
          .select('*')
          .gte('visit_date', range.start)
          .lte('visit_date', range.end)
          .order('visit_date', { ascending: true })
        if (error) throw error
        data = sel || []
      }

      const normalized: VisitRow[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        visit_date: (r.visit_date ?? '').slice(0, 10),
        status: (r.status ?? 'planned'),
        client_name: String(r.client_name ?? r.client ?? r.name ?? '—'),
        specialty: r.specialty ?? r.prospect?.specialty ?? '—',
        area: r.area ?? r.prospect?.area ?? '—',
        notes: r.notes ?? null,
        visited_by: r.visited_by ?? null,
      }))

      setRows(normalized)

      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
      if (!selectedDay.startsWith(monthStr)) {
        const firstWith = normalized.find(v => v.visit_date?.startsWith(monthStr))
        setSelectedDay(firstWith?.visit_date ?? `${monthStr}-01`)
      }
    } catch (e: any) {
      console.error('visits load error:', e)
      setErrorMsg(e?.message ?? 'Failed to load visits.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year, month])
  useEffect(() => { setNewDate(selectedDay) }, [selectedDay])

  const byDate = useMemo(() => {
    const m = new Map<string, VisitRow[]>()
    for (const r of rows) {
      const d = r.visit_date
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(r)
    }
    return m
  }, [rows])

  const dayVisits = byDate.get(selectedDay) ?? []

  const prevMonth = () => {
    const d = new Date(year, month, 1); d.setMonth(month - 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }
  const nextMonth = () => {
    const d = new Date(year, month, 1); d.setMonth(month + 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }

  const startJourney = async () => {
    if (dayVisits.length === 0) return
    try {
      await startTracking(currentUser?.username ?? null)
      setJourneyMode(true)
      setActiveVisitId(null)
      await setCurrentVisitId(null)  // no active visit until user checks one
    } catch (e: any) {
      Alert.alert('Location', e?.message ?? 'Failed to start tracking.')
    }
  }

  const selectVisit = async (visit: VisitRow) => {
    try {
      const username = currentUser?.username ?? null

      // if another visit was active, revert it to planned
      const prevId = activeVisitId
      if (prevId && prevId !== visit.id) {
        await supabase.rpc('set_visit_status', { p_id: prevId, p_status: 'planned', p_user: username })
        setRows(prev => prev.map(r => r.id === prevId ? { ...r, status: 'planned' } : r))
      }

      const goingActive = activeVisitId !== visit.id
      const newStatus = goingActive ? 'en_route' : 'planned'
      await supabase.rpc('set_visit_status', { p_id: visit.id, p_status: newStatus, p_user: username })

      setRows(prev => prev.map(r =>
        r.id === visit.id ? { ...r, status: newStatus, visited_by: goingActive ? (username ?? r.visited_by ?? null) : r.visited_by } : r
      ))
      setActiveVisitId(goingActive ? visit.id : null)

      // link future GPS points to this visit (or unlink)
      await setCurrentVisitId(goingActive ? visit.id : null)
    } catch (e: any) {
      console.error('set_visit_status error', e)
      Alert.alert('Error', e?.message ?? 'Failed to update status.')
    }
  }

  const endJourneyOpen = () => {
    if (!activeVisitId) return
    setSummary('')
    setShowFinishModal(true)
  }

  const endJourneyConfirm = async () => {
    if (!activeVisitId) return
    try {
      const username = currentUser?.username ?? null
      await supabase.rpc('finish_visit', { p_id: activeVisitId, p_summary: summary, p_user: username })
      setRows(prev => prev.map(r => r.id === activeVisitId ? { ...r, status: 'done', notes: summary, visited_by: username ?? r.visited_by ?? null } : r))

      await stopTracking()
      await setCurrentVisitId(null)

      setActiveVisitId(null)
      setJourneyMode(false)
      setShowFinishModal(false)
      if (Platform.OS === 'web') console.log('Visit finished with summary:', summary)
    } catch (e: any) {
      console.error('finish_visit error', e)
      Alert.alert('Error', e?.message ?? 'Failed to finish visit.')
    }
  }

  // add visit
  const openAdd = () => {
    setNewName('')
    setNewSpec('')
    setNewArea('')
    setNewDate(selectedDay)
    setShowAddModal(true)
  }

  const addVisit = async () => {
    const name = newName.trim()
    const date = newDate.trim()
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Missing/Invalid', 'Client name and a date like 2025-10-10 are required.')
      return
    }
    try {
      const { data, error } = await supabase
        .from('visits')
        .insert({
          client_name: name,
          specialty: newSpec || null,
          area: newArea || null,
          visit_date: date,
          status: 'planned',
          visited_by: null, // stamped when en_route/done
        })
        .select('*')
        .single()

      if (error) throw error
      const r = data as any
      const inserted: VisitRow = {
        id: String(r.id),
        visit_date: (r.visit_date ?? '').slice(0, 10),
        status: r.status ?? 'planned',
        client_name: r.client_name ?? name,
        specialty: r.specialty ?? newSpec,
        area: r.area ?? newArea,
        notes: r.notes ?? null,
        visited_by: r.visited_by ?? null,
      }
      setRows(prev => [...prev, inserted].sort((a, b) =>
        a.visit_date.localeCompare(b.visit_date) || a.client_name.localeCompare(b.client_name)
      ))
      setShowAddModal(false)
      setSelectedDay(inserted.visit_date)
    } catch (e: any) {
      console.error('add visit error', e)
      Alert.alert('Error', e?.message ?? 'Failed to add visit.')
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Visits & Schedule</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.calendarWrap}>
        <View style={styles.calHeader}>
          <Pressable onPress={prevMonth} style={styles.navBtn}><Text style={styles.navTxt}>‹</Text></Pressable>
          <Text style={styles.monthTitle}>{monthLabel(year, month)}</Text>
          <Pressable onPress={nextMonth} style={styles.navBtn}><Text style={styles.navTxt}>›</Text></Pressable>
        </View>

        <View style={styles.weekHeader}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <Text key={d} style={styles.weekHeadTxt}>{d}</Text>
          ))}
        </View>

        {loading ? (
          <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator /></View>
        ) : errorMsg ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{errorMsg}</Text>
            <Pressable onPress={load} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
              <Text style={styles.btnPrimaryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {daysGrid.map((week, wi) => (
              <View key={wi} style={styles.row}>
                {week.map((cell) => {
                  const key = `${cell.year}-${String(cell.month+1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
                  const inMonth = cell.month === month
                  const isSel = key === selectedDay
                  const dots = (byDate.get(key) || []).length
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelectedDay(key)}
                      style={[
                        styles.cell,
                        !inMonth && styles.cellMuted,
                        isSel && styles.cellSelected,
                      ]}
                    >
                      <Text style={[styles.cellTxt, !inMonth && { color: '#94a3b8' }]}>{cell.day}</Text>
                      {dots > 0 && (
                        <View style={styles.dotRow}>
                          {Array.from({ length: Math.min(dots, 3) }).map((_, i) => (
                            <View key={i} style={styles.dot} />
                          ))}
                          {dots > 3 && <Text style={styles.dotMore}>+{dots-3}</Text>}
                        </View>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.listWrap}>
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>Visits on {selectedDay}</Text>

          {journeyMode ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => activeVisitId && onViewMap?.(activeVisitId)}
                disabled={!activeVisitId}
                style={[styles.mapBtn, !activeVisitId && { opacity: 0.5 }]}
              >
                <Text style={styles.mapBtnTxt}>View Route</Text>
              </Pressable>
              <Pressable
                onPress={endJourneyOpen}
                disabled={!activeVisitId}
                style={[styles.endBtn, !activeVisitId && { opacity: 0.5 }]}
              >
                <Text style={styles.endBtnTxt}>End Journey</Text>
              </Pressable>
              <Pressable onPress={openAdd} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={startJourney}
                disabled={dayVisits.length === 0}
                style={[styles.startBtn, dayVisits.length === 0 && { opacity: 0.5 }]}
              >
                <Text style={styles.startBtnTxt}>Start Journey</Text>
              </Pressable>
              <Pressable onPress={openAdd} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </Pressable>
            </View>
          )}
        </View>

        {loading ? (
          <View style={{ padding: 12 }}><ActivityIndicator /></View>
        ) : dayVisits.length === 0 ? (
          <Text style={{ color: '#6b7280', paddingHorizontal: 16 }}>No visits planned.</Text>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {dayVisits.map(v => {
              const isActive = journeyMode && activeVisitId === v.id
              return (
                <View key={v.id} style={[styles.card, isActive && { borderColor: '#2563eb' }]}>
                  {journeyMode ? (
                    <Pressable
                      onPress={() => selectVisit(v)}
                      style={[styles.checkbox, isActive && styles.checkboxChecked]}
                    >
                      {isActive ? <Text style={styles.checkboxTick}>✓</Text> : null}
                    </Pressable>
                  ) : null}

                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{v.client_name || '—'}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {(v.specialty || '—')} • {(v.area || '—')}
                    </Text>
                    {!!v.visited_by && (
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        Visitor: {v.visited_by}
                      </Text>
                    )}
                  </View>

                  <StatusChip status={isActive ? 'en_route' : v.status} />
                </View>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* Finish modal */}
      {showFinishModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>End Journey</Text>
            <Text style={styles.modalSub}>Add a short summary for this visit.</Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              placeholder="Summary…"
              placeholderTextColor="#9aa0a6"
              multiline
              style={styles.modalInput}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowFinishModal(false)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={endJourneyConfirm} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Add Visit modal */}
      {showAddModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Visit</Text>
            <Text style={styles.modalSub}>Enter client details. Date should be YYYY-MM-DD.</Text>

            <Text style={styles.inputLabel}>Client name*</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Dr. Jane Doe"
              placeholderTextColor="#9aa0a6"
              style={styles.textInput}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Specialty</Text>
                <TextInput
                  value={newSpec}
                  onChangeText={setNewSpec}
                  placeholder="Pediatrics"
                  placeholderTextColor="#9aa0a6"
                  style={styles.textInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Area</Text>
                <TextInput
                  value={newArea}
                  onChangeText={setNewArea}
                  placeholder="Beirut"
                  placeholderTextColor="#9aa0a6"
                  style={styles.textInput}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Date (YYYY-MM-DD)*</Text>
            <TextInput
              value={newDate}
              onChangeText={setNewDate}
              placeholder="2025-10-10"
              placeholderTextColor="#9aa0a6"
              style={styles.textInput}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable onPress={() => setShowAddModal(false)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addVisit} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

/* ---------------- helpers ---------------- */
function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function monthLabel(year: number, month0: number) {
  return new Date(year, month0, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
function monthRange(year: number, month0: number) {
  const start = new Date(year, month0, 1)
  const end = new Date(year, month0 + 1, 0)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}
function buildCalendarGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1)
  const last = new Date(year, month0 + 1, 0)
  const firstDow = (first.getDay() + 6) % 7
  const daysInMonth = last.getDate()
  const days: { year: number; month: number; day: number }[] = []
  const prevLast = new Date(year, month0, 0)
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevLast.getDate() - i
    const pm = new Date(year, month0 - 1, d)
    days.push({ year: pm.getFullYear(), month: pm.getMonth(), day: pm.getDate() })
  }
  for (let d = 1; d <= daysInMonth; d++) days.push({ year, month: month0, day: d })
  const total = Math.ceil(days.length / 7) * 7
  const nextCount = total - days.length
  for (let i = 1; i <= nextCount; i++) {
    const nm = new Date(year, month0 + 1, i)
    days.push({ year: nm.getFullYear(), month: nm.getMonth(), day: nm.getDate() })
  }
  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

/* ---------------- presentational ---------------- */
function StatusChip({ status }: { status: 'planned' | 'en_route' | 'done' | 'skipped' | string }) {
  const map: any = {
    planned: { bg: '#eef2ff', fg: '#1d4ed8', text: 'PLANNED' },
    en_route:{ bg: '#fff7ed', fg: '#9a3412', text: 'EN ROUTE' },
    done:    { bg: '#dcfce7', fg: '#065f46', text: 'DONE' },
    skipped: { bg: '#fee2e2', fg: '#991b1b', text: 'SKIPPED' },
  }
  const s = map[status] || map['planned']
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: s.bg }}>
      <Text style={{ color: s.fg, fontWeight: '800', fontSize: 12 }}>{s.text}</Text>
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

  calendarWrap: { padding: 16 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  navTxt: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  monthTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  weekHeader: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 6 },
  weekHeadTxt: { flex: 1, textAlign: 'center', fontSize: 12, color: '#6b7280', fontWeight: '800' },

  grid: {
    borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#fff',
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
    padding: 8,
  },
  row: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  cell: {
    flex: 1, height: 56, borderRadius: 12, borderWidth: 1, borderColor: '#eef0f3',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: 4,
  },
  cellMuted: { opacity: 0.45 },
  cellSelected: { borderColor: '#2563eb', backgroundColor: '#e0e7ff' },
  cellTxt: { fontSize: 14, fontWeight: '800', color: '#111827' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, flexWrap: 'nowrap' },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: '#2563eb' },
  dotMore: { fontSize: 10, color: '#2563eb', fontWeight: '800' },

  listWrap: { flex: 1, paddingTop: 4 },
  listHead: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },

  startBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb',
  },
  startBtnTxt: { color: '#fff', fontWeight: '800' },

  endBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0ea5e9',
  },
  endBtnTxt: { color: '#fff', fontWeight: '800' },

  addBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10b981',
  },
  addBtnTxt: { color: '#fff', fontWeight: '800' },

  mapBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#9333ea',
  },
  mapBtnTxt: { color: '#fff', fontWeight: '800' },

  card: {
    marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#eef0f3',
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10,
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#2563eb',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2563eb' },
  checkboxTick: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 14 },

  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  cardMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },

  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
  btnGhost: { backgroundColor: '#fff' },
  btnGhostText: { color: '#111827', fontWeight: '800' },

  modalOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, gap: 10,
    // @ts-ignore rn-web
    boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#6b7280' },
  modalInput: {
    minHeight: 100, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 10, textAlignVertical: 'top', color: '#0f172a', backgroundColor: '#f9fafb',
  },

  inputLabel: { fontSize: 12, color: '#6b7280', marginTop: 6, marginBottom: 4, fontWeight: '700' },
  textInput: {
    height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 10, backgroundColor: '#f9fafb', color: '#0f172a',
  },
})
