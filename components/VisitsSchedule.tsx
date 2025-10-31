// components/VisitsSchedule.tsx
import { useEffect, useMemo, useState, useRef } from 'react'
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput, Platform, RefreshControl,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { startTracking, stopTracking, setCurrentVisitId } from '../lib/tracking'

type VisitRow = {
  id: string
  visit_date: string
  status: 'planned' | 'en_route' | 'done' | 'skipped' | string
  client_name: string
  specialty?: string | null
  area?: string | null
  notes?: string | null
  visited_by?: string | null
  note_type?: 'SALES ORDER' | 'RFR' | 'COLLECTION' | string | null
  sample_type?: string[] | null
  sample_distributed?: number[] | null
}

type UserLite = { id: string; username: string }
type Props = { onBack?: () => void; currentUser?: UserLite }

type SampleStock = { id: string; sample_type: string; qty: number }
type SampleLine  = { type: string; qty: string }

const SHOW_UNASSIGNED = true

export default function VisitsSchedule({ onBack, currentUser }: Props) {
  const me = (currentUser?.username ?? '').trim() || null
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null)

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<VisitRow[]>([])
  const [selectedDay, setSelectedDay] = useState(toIsoDate(today))

  // journey state
  const [journeyMode, setJourneyMode] = useState(false)
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null)
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [summary, setSummary] = useState('')
  const [noteType, setNoteType] = useState<'SALES ORDER' | 'RFR' | 'COLLECTION'>('SALES ORDER')

  // samples UI state
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [stock, setStock] = useState<SampleStock[]>([])
  const [sampleLines, setSampleLines] = useState<SampleLine[]>([{ type: '', qty: '' }])
  const [sampleError, setSampleError] = useState<string | null>(null)

  // toast (reused for multiple actions)
  const [sendStatus, setSendStatus] = useState<'idle'|'sending'|'success'|'error'>('idle')
  const [sendMessage, setSendMessage] = useState<string>('')
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (kind: 'neutral'|'success'|'error', msg: string, ms = 1400) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setSendStatus(kind === 'neutral' ? 'sending' : kind)
    setSendMessage(msg)
    hideTimer.current = setTimeout(() => { setSendStatus('idle'); setSendMessage('') }, ms)
  }

  const range = monthRange(year, month)

  /* load / refresh */
  const load = async () => {
    setLoading(true); setErrorMsg(null)
    try {
      let query = supabase
        .from('visits')
        .select('id, visit_date, status, client_name, specialty, area, notes, visited_by, note_type, sample_type, sample_distributed')
        .gte('visit_date', range.start)
        .lte('visit_date', range.end)

      if (me) {
        query = SHOW_UNASSIGNED
          ? query.or(`visited_by.eq.${me},visited_by.is.null`)
          : query.eq('visited_by', me)
      } else {
        query = query.is('visited_by', null)
      }

      const { data, error } = await query.order('visit_date', { ascending: true })
      if (error) throw error

      const normalized: VisitRow[] = (data as any[] ?? []).map((r: any) => {
        const v: VisitRow = {
          id: String(r.id),
          visit_date: String(r.visit_date ?? '').slice(0, 10),
          status: (r.status ?? 'planned'),
          client_name: String(r.client_name ?? '—'),
          specialty: r.specialty ?? '—',
          area: r.area ?? '—',
          notes: r.notes ?? null,
          visited_by: r.visited_by ?? null,
          note_type: r.note_type ?? null,
          sample_type: Array.isArray(r.sample_type) ? r.sample_type : null,
          sample_distributed: Array.isArray(r.sample_distributed) ? r.sample_distributed : null,
        }
        return v
      })

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

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  useEffect(() => { load() }, [year, month])
  useEffect(() => { setNewDate(selectedDay) }, [selectedDay])

  /* samples helpers */
  const loadSampleStock = async (u: string) => {
    setLoadingSamples(true)
    try {
      const { data, error } = await (supabase as any)
        .from('sample_distribution')
        .select('id, username, sample_type, qty')
        .eq('username', u)
        .order('sample_type', { ascending: true })
      if (error) throw error
      const norm: SampleStock[] = (data as any[] ?? []).map((r: any) => ({
        id: String(r.id),
        sample_type: String(r.sample_type ?? 'UNKNOWN'),
        qty: Number(r.qty ?? 0) || 0,
      }))
      setStock(norm)
    } catch (e: any) {
      console.error('load sample stock error:', e)
      Alert.alert('Samples', e?.message ?? 'Failed to load samples.')
      setStock([])
    } finally {
      setLoadingSamples(false)
    }
  }

  async function findSampleRow(u: string, type: string): Promise<SampleStock | null> {
    const { data, error } = await (supabase as any)
      .from('sample_distribution')
      .select('id, username, sample_type, qty')
      .eq('username', u)
      .ilike('sample_type', type)
      .limit(1)
    if (error) throw error
    const row = (data as any[] ?? [])[0]
    if (!row) return null
    return { id: String(row.id), sample_type: String(row.sample_type), qty: Number(row.qty ?? 0) || 0 }
  }

  async function decrementStock(u: string, type: string, delta: number) {
    const existing = await findSampleRow(u, type)
    if (!existing) {
      const ins = await (supabase as any)
        .from('sample_distribution')
        .insert([{ username: u, sample_type: type, qty: 0 }])
        .select('id')
        .limit(1)
      if (ins.error) throw ins.error
    }
    const row = await findSampleRow(u, type)
    if (!row) throw new Error('Failed to create/find sample row')

    const newQty = Math.max(0, row.qty - delta)
    const { error: updErr } = await (supabase as any)
      .from('sample_distribution')
      .update({ qty: newQty })
      .eq('id', row.id)
    if (updErr) throw updErr
  }

  /* derived */
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

  /* month nav */
  const prevMonth = () => {
    const d = new Date(year, month, 1); d.setMonth(month - 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
    setJourneyMode(false); setActiveVisitId(null); setCurrentVisitId(null).catch(()=>{})
  }
  const nextMonth = () => {
    const d = new Date(year, month, 1); d.setMonth(month + 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
    setJourneyMode(false); setActiveVisitId(null); setCurrentVisitId(null).catch(()=>{})
  }

  /* journey actions */
  const startJourney = async () => {
    if (dayVisits.length === 0) return
    try {
      const v = activeVisitId ? rows.find(r => r.id === activeVisitId) : undefined
      const who = (v?.visited_by ?? me) ?? null
      await startTracking(who)
      setJourneyMode(true)
      setActiveVisitId(null)
      await setCurrentVisitId(null)
    } catch (e: any) {
      Alert.alert('Location', e?.message ?? 'Failed to start tracking.')
    }
  }

  const selectVisit = async (visit: VisitRow) => {
    if (!journeyMode) return
    if (showFinishModal) return
    if (visit.status === 'done' || visit.status === 'skipped') return

    const nextStatus = visit.status === 'en_route' ? 'planned' : 'en_route'

    try {
      const who: string | null = (visit.visited_by ?? me) ?? null
      const { error } = await supabase
        .from('visits')
        .update({
          status: nextStatus,
          visited_by: nextStatus === 'en_route' ? who : (visit.visited_by ?? who ?? null),
        })
        .eq('id', visit.id)
      if (error) throw error

      setRows(prev => prev.map(r =>
        r.id === visit.id
          ? { ...r, status: nextStatus, visited_by: nextStatus === 'en_route' ? (who ?? r.visited_by ?? null) : r.visited_by }
          : r
      ))

      if (nextStatus === 'en_route') {
        setActiveVisitId(visit.id)
        await setCurrentVisitId(visit.id)
      } else {
        if (activeVisitId === visit.id) {
          setActiveVisitId(null)
          await setCurrentVisitId(null)
        }
      }
    } catch (e: any) {
      console.error('update visit status error', e)
      Alert.alert('Error', e?.message ?? 'Failed to update status.')
    }
  }

  /* modal open */
  const endJourneyOpen = async () => {
    if (!activeVisitId) return Alert.alert('Select a visit', 'Pick a visit (checkbox) to end.')

    const v = rows.find(r => r.id === activeVisitId)
    let who = (v?.visited_by ?? '').trim()

    if (!who) {
      if (!me) return Alert.alert('Missing visitor', 'No logged-in user to assign.')
      const { error } = await supabase.from('visits').update({ visited_by: me }).eq('id', activeVisitId)
      if (error) return Alert.alert('Error', error.message ?? 'Failed to set visitor on the visit.')
      who = me
      setRows(prev => prev.map(r => r.id === activeVisitId ? { ...r, visited_by: me } : r))
    }

    setResolvedUsername(who)
    setSummary('')
    setNoteType('SALES ORDER')
    setSampleLines([{ type: '', qty: '' }])
    setSampleError(null)
    setShowFinishModal(true)

    await loadSampleStock(who)
  }

  /* sample line helpers + live validation */
  const recalcSampleError = (lines: SampleLine) => {} // no-op to satisfy TS predeclare (we redefine below)

  const setLineType = (idx: number, v: string) => {
    setSampleLines(prev => {
      const newLines = prev.map((l, i) => i === idx ? { ...l, type: v } : l)
      validateRequestedSamples(newLines)
      return newLines
    })
  }
  const setLineQty = (idx: number, v: string) => {
    const clean = v.replace(/[^\d]/g, '')
    setSampleLines(prev => {
      const newLines = prev.map((l, i) => i === idx ? { ...l, qty: clean } : l)
      validateRequestedSamples(newLines)
      return newLines
    })
  }
  const addLine = () => setSampleLines(prev => {
    const newLines = [...prev, { type: '', qty: '' }]
    validateRequestedSamples(newLines)
    return newLines
  })
  const removeLine = (idx: number) => setSampleLines(prev => {
    const newLines = prev.filter((_, i) => i !== idx)
    validateRequestedSamples(newLines)
    return newLines
  })

  /** Validate requested samples against stock; sets sampleError and optional toast */
  const validateRequestedSamples = (lines: SampleLine[]) => {
    if (!stock.length) { setSampleError(null); return true }
    const req = new Map<string, number>()
    for (const l of lines) {
      const t = (l.type || '').trim()
      const q = l.qty === '' ? 0 : Number(l.qty)
      if (!t || !q) continue
      req.set(t, (req.get(t) ?? 0) + q)
    }
    for (const [t, q] of req.entries()) {
      const found = stock.find(s => s.sample_type.toLowerCase() === t.toLowerCase())
      const avail = found?.qty ?? 0
      if (q > avail) {
        const msg = `Only ${avail} of "${t}" available (requested ${q}).`
        setSampleError(msg)
        showToast('error', msg, 1600)
        return false
      }
    }
    setSampleError(null)
    return true
  }

  /* finish journey */
  const endJourneyConfirm = async () => {
    const vid = activeVisitId
    if (!vid) return

    const who = resolvedUsername ?? me
    if (!who) return Alert.alert('Samples', 'No visitor resolved for this visit.')

    // live validation before saving
    if (!validateRequestedSamples(sampleLines)) return

    // collect requested samples
    const reqMap = new Map<string, number>()
    for (const l of sampleLines) {
      const t = (l.type || '').trim()
      const q = l.qty === '' ? 0 : Number(l.qty)
      if (!t && q === 0) continue
      if (!t) return Alert.alert('Samples', 'Choose a sample type.')
      if (!Number.isInteger(q) || q < 0) return Alert.alert('Samples', 'Quantity must be a whole number ≥ 0.')
      if (q === 0) continue
      reqMap.set(t, (reqMap.get(t) ?? 0) + q)
    }

    // build arrays for visits: order deterministic
    const entries = Array.from(reqMap.entries()).sort((a,b) => a[0].localeCompare(b[0]))
    const sample_type: string[] = entries.map(([t]) => t)
    const sample_distributed: number[] = entries.map(([,q]) => q)
    const samplesStr = entries.map(([t, q]) => `${t} x${q}`).join('; ')

    try {
      const newNotes = [(summary || '').trim(), sample_type.length ? `Samples: ${samplesStr}` : null]
        .filter(Boolean).join('\n')

      const { error: updErr, status } = await supabase
        .from('visits')
        .update({
          status: 'done',
          notes: newNotes,
          visited_by: who,
          note_type: noteType,
          sample_type,
          sample_distributed,
        })
        .eq('id', vid)

      if (updErr && updErr.code !== 'PGRST116' && status !== 406) throw updErr

      for (const [t, q] of entries) {
        await decrementStock(who, t, q)
      }

      await stopTracking()
      await setCurrentVisitId(null)
      setShowFinishModal(false)
      setJourneyMode(false)
      setActiveVisitId(null)
      setSummary('')
      setSampleLines([{ type: '', qty: '' }])
      setSampleError(null)

      await load()
      await loadSampleStock(who)

      showToast('success', 'Visit saved ✓')
      if (Platform.OS === 'web') console.log('Visit finished OK', { vid, noteType, samplesStr })
    } catch (e: any) {
      console.error('finish visit update error', e)
      showToast('error', e?.message ?? 'Failed to finish visit.')
    }
  }

  /* weekly schedule send */
  const weekRange = useMemo(() => weekRangeFromISO(selectedDay), [selectedDay])

  const sendWeek = async () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setSendStatus('sending')
    setSendMessage('Sending this week’s schedule…')

    try {
      const { start, end } = weekRange
      const weekly = rows.filter(r => r.visit_date >= start && r.visit_date <= end)

      const payload = [{
        username: me || '(unknown)',
        week_start: start,
        week_end: end,
        visits: weekly.map(v => ({
          id: v.id,
          date: v.visit_date,
          client: v.client_name,
          status: v.status,
          type: v.note_type ?? null,
          notes: v.notes ?? null,
          sample_type: v.sample_type ?? null,
          sample_distributed: v.sample_distributed ?? null,
        })),
      }]

      const { error } = await supabase
        .from('weekly_schedules')
        .upsert(payload, { onConflict: 'username,week_start' })

      if (error) throw error

      setSendStatus('success')
      setSendMessage('Schedule sent ✓')
      hideTimer.current = setTimeout(() => {
        setSendStatus('idle'); setSendMessage('')
      }, 1400)
    } catch (e: any) {
      setSendStatus('error')
      setSendMessage(e?.message ?? 'Failed to send schedule.')
    }
  }

  /* add visit */
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSpec, setNewSpec] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newDate, setNewDate] = useState(selectedDay)

  const openAdd = () => {
    setNewName(''); setNewSpec(''); setNewArea(''); setNewDate(selectedDay)
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
      const { error } = await supabase
        .from('visits')
        .insert([{
          client_name: name,
          specialty: newSpec || null,
          area: newArea || null,
          visit_date: date,
          status: 'planned',
          visited_by: me,
          note_type: null,
          sample_type: [],
          sample_distributed: [],
        }])
      if (error) throw error

      await load()
      setShowAddModal(false)
      setSelectedDay(date)
      showToast('success', 'Visit saved ✓')
    } catch (e: any) {
      console.error('add visit error', e)
      showToast('error', e?.message ?? 'Failed to add visit.')
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Visits & Schedule</Text>
        <View style={{ width: 8 }} />
      </View>

      <Calendar
        year={year} month={month} prevMonth={prevMonth} nextMonth={nextMonth}
        selectedDay={selectedDay} onSelectDay={setSelectedDay}
        byDate={byDate}
        loading={loading} errorMsg={errorMsg} reload={load}
      />

      <DayList
        selectedDay={selectedDay}
        dayVisits={byDate.get(selectedDay) ?? []}
        journeyMode={journeyMode}
        activeVisitId={activeVisitId}
        startJourney={startJourney}
        openAdd={openAdd}
        endJourneyOpen={endJourneyOpen}
        selectVisit={selectVisit}
        showFinishModal={showFinishModal}
        onSendWeek={sendWeek}
        sending={sendStatus === 'sending'}
        weekStart={weekRange.start}
        weekEnd={weekRange.end}
      />

      {/* Toast overlay (used for save success, errors, and sending weekly) */}
      {sendStatus !== 'idle' && (
        <View style={styles.statusOverlay} pointerEvents="none">
          <View style={[
            styles.statusCard,
            sendStatus === 'sending' ? styles.statusNeutral :
            sendStatus === 'success' ? styles.statusGood : styles.statusBad
          ]}>
            {sendStatus === 'sending' ? <ActivityIndicator /> : null}
            <Text style={styles.statusText}>{sendMessage}</Text>
          </View>
        </View>
      )}

      {/* Finish modal */}
      {showFinishModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>End Journey</Text>
            <Text style={styles.modalSub}>Add a summary, select a type, and record any samples given.</Text>

            <Text style={styles.inputLabel}>Note type*</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {(['SALES ORDER','RFR','COLLECTION'] as const).map(opt => (
                <Pressable
                  key={opt}
                  onPress={() => setNoteType(opt)}
                  style={[styles.pill, noteType === opt ? styles.pillOn : styles.pillOff]}
                >
                  <Text style={noteType === opt ? styles.pillTxtOn : styles.pillTxtOff}>{opt}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Summary</Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              placeholder="Add visit summary…"
              placeholderTextColor="#9aa0a6"
              multiline
              style={styles.modalInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 8 }]}>
              Samples given {loadingSamples ? '(loading...)' : ''}
            </Text>

            {!!sampleError && (
              <Text style={{ color: '#b91c1c', marginBottom: 6, fontWeight: '800' }}>
                {sampleError}
              </Text>
            )}

            {stock.length === 0 && !loadingSamples ? (
              <Text style={{ color: '#6b7280', marginBottom: 6 }}>
                No samples available{resolvedUsername ? ` for ${resolvedUsername}` : ''}.
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {sampleLines.map((line, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {stock.map(s => {
                          const on = line.type.toLowerCase() === s.sample_type.toLowerCase()
                          return (
                            <Pressable
                              key={`${s.id}-${s.sample_type}`}
                              onPress={() => setLineType(idx, s.sample_type)}
                              style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
                            >
                              <Text style={on ? styles.pillTxtOn : styles.pillTxtOff}>
                                {s.sample_type} ({s.qty})
                              </Text>
                            </Pressable>
                          )
                        })}
                      </View>
                    </ScrollView>

                    <TextInput
                      value={line.qty}
                      onChangeText={(v) => setLineQty(idx, v)}
                      keyboardType="numeric"
                      placeholder="Qty"
                      placeholderTextColor="#9aa0a6"
                      style={[styles.textInput, { width: 80 }]}
                    />

                    {sampleLines.length > 1 && (
                      <Pressable onPress={() => removeLine(idx)} style={[styles.btn, styles.btnGhost, { width: 44 }]}>
                        <Text style={styles.btnGhostText}>–</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={addLine} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                    <Text style={styles.btnGhostText}>+ Add another sample</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowFinishModal(false)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={endJourneyConfirm}
                disabled={!!sampleError}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { flex: 1, opacity: sampleError ? 0.6 : 1 }
                ]}
              >
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





/* ---- Smaller components ---- */
function Calendar({ year, month, prevMonth, nextMonth, selectedDay, onSelectDay, byDate, loading, errorMsg, reload }: any) {
  const daysGrid = buildCalendarGrid(year, month)
  return (
    <View style={styles.calendarWrap}>
      <View style={styles.calHeader}>
        <Pressable onPress={prevMonth} style={styles.navBtn}><Text style={styles.navTxt}>‹</Text></Pressable>
        <Text style={styles.monthTitle}>{monthLabel(year, month)}</Text>
        <Pressable onPress={nextMonth} style={styles.navBtn}><Text style={styles.navTxt}>›</Text></Pressable>
      </View>

      <View style={styles.weekHeader}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d: string) => (
          <Text key={d} style={styles.weekHeadTxt}>{d}</Text>
        ))}
      </View>

      {loading ? (
        <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator /></View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{errorMsg}</Text>
          <Pressable onPress={reload} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.grid}>
          {daysGrid.map((week: any[], wi: number) => (
            <View key={wi} style={styles.row}>
              {week.map((cell: any) => {
                const key = `${cell.year}-${String(cell.month+1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
                const inMonth = cell.month === month
                const isSel = key === selectedDay
                const dots = (byDate.get(key) || []).length
                return (
                  <Pressable
                    key={key}
                    onPress={() => onSelectDay(key)}
                    style={[styles.cell, !inMonth && styles.cellMuted, isSel && styles.cellSelected]}
                  >
                    <Text style={[styles.cellTxt, !inMonth && { color: '#94a3b8' }]}>{cell.day}</Text>
                    {dots > 0 && (
                      <View style={styles.dotRow}>
                        {Array.from({ length: Math.min(dots, 3) }).map((_, i) => <View key={i} style={styles.dot} />)}
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
  )
}

function DayList({
  selectedDay, dayVisits, journeyMode, activeVisitId, startJourney, openAdd, endJourneyOpen, selectVisit, showFinishModal,
  onSendWeek, sending, weekStart, weekEnd
}: any) {
  return (
    <View style={styles.listWrap}>
      <View style={styles.listHead}>
        <Text style={styles.listTitle}>Visits on {selectedDay}</Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={onSendWeek} disabled={sending} style={[styles.weekBtn, sending && { opacity: 0.6 }]}>
            {sending ? <ActivityIndicator /> : <Text style={styles.weekBtnTxt}>Send Week {weekStart} → {weekEnd}</Text>}
          </Pressable>

          {journeyMode ? (
            <>
              <Pressable onPress={endJourneyOpen} disabled={!activeVisitId} style={[styles.endBtn, !activeVisitId && { opacity: 0.5 }]}>
                <Text style={styles.endBtnTxt}>End Journey</Text>
              </Pressable>
              <Pressable onPress={openAdd} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={startJourney} disabled={dayVisits.length === 0} style={[styles.startBtn, dayVisits.length === 0 && { opacity: 0.5 }]}>
                <Text style={styles.startBtnTxt}>Start Journey</Text>
              </Pressable>
              <Pressable onPress={openAdd} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {dayVisits.length === 0 ? (
        <Text style={{ color: '#6b7280', paddingHorizontal: 16 }}>No visits planned.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={()=>{}} />}>
          {dayVisits.map((v: VisitRow) => {
            const isActive = journeyMode && activeVisitId === v.id
            const canToggle = journeyMode && !showFinishModal && v.status !== 'done' && v.status !== 'skipped'
            return (
              <View key={v.id} style={[styles.card, isActive && { borderColor: '#2563eb' }]}>
                {canToggle ? (
                  <Pressable onPress={() => selectVisit(v)} style={[styles.checkbox, isActive && styles.checkboxChecked]}>
                    {isActive ? <Text style={styles.checkboxTick}>✓</Text> : null}
                  </Pressable>
                ) : <View style={{ width: 22 }} />}

                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{v.client_name || '—'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {(v.specialty || '—')} • {(v.area || '—')}
                  </Text>
                  {!!v.visited_by && (
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      Visitor: {v.visited_by}{v.note_type ? ` • ${v.note_type}` : ''}
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
  )
}

/* helpers */
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

function weekRangeFromISO(iso: string) {
  const [y,m,d] = iso.split('-').map(Number)
  const base = new Date(y, m-1, d)
  let day = base.getDay(); if (day === 0) day = 7
  const monday = new Date(base); monday.setDate(base.getDate() - (day - 1))
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: toIsoDate(monday), end: toIsoDate(sunday) }
}

/* presentational */
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
  // --- Responsive additions ---
  responsiveFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#edf0f5',
    backgroundColor: '#fff',
    flexDirection: 'row',
  },
  floatingAddBtn: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981', // Add button color
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)',
  },

  // --- Original Styles (Modified for responsiveness) ---
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  // AppBar and Header components are fine as they scale horizontally naturally
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

  // Calendar Wrapper - Padding remains, but container width is controlled by the component logic above
  calendarWrap: { padding: 16 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  navTxt: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  monthTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },

  weekHeader: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 6 },
  weekHeadTxt: { flex: 1, textAlign: 'center', fontSize: 12, color: '#6b7280', fontWeight: '800' },

  // Grid and Cell are the most important for responsiveness here
  grid: {
    borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#fff',
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
    padding: 8,
  },
  row: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  // Key change: flex: 1 makes this cell take up an equal share of space in the row
  cell: {
    flex: 1,
    height: 56, // Fixed height is often fine for calendar cells
    borderRadius: 12, borderWidth: 1, borderColor: '#eef0f3',
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

  // Buttons (Unchanged, fixed height is usually fine for buttons)
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

  weekBtn: {
    height: 40, paddingHorizontal: 14, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111827',
  },
  weekBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },

  // Card (Uses flex: 1 internally for text content to wrap)
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

  // Modal (Key change: using maxWidth for responsiveness)
  modalOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 560, // Enforce a max width for large screens
    backgroundColor: '#fff', borderRadius: 16,
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

  pill: {
    height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  pillOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillOff: { backgroundColor: '#fff', borderColor: '#e5e7eb' },
  pillTxtOn: { color: '#fff', fontWeight: '800' },
  pillTxtOff: { color: '#111827', fontWeight: '800' },

  statusOverlay: {
    position: 'absolute', left: 0, right: 0, bottom: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  statusCard: {
    minWidth: 220, maxWidth: 360,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center', gap: 8,
    // @ts-ignore rn-web
    boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
  },
  statusNeutral: { backgroundColor: '#111827' },
  statusGood: { backgroundColor: '#10b981' },
  statusBad: { backgroundColor: '#ef4444' },
  statusText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
})