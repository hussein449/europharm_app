// components/AchievementsReview.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  ScrollView, RefreshControl
} from 'react-native'
import { supabase } from '../lib/supabase'

type Visit = {
  id: string
  visit_date: string // YYYY-MM-DD
  status: 'planned' | 'en_route' | 'done' | 'skipped' | string
  client_name?: string | null
  visited_by: string | null
}

type Props = {
  onBack?: () => void
  currentUser?: { id: string; username: string }
}

type RangeMode = 'day' | 'week'
type StatusTab = 'all' | 'planned' | 'done'

export default function AchievementsReview({ onBack, currentUser }: Props) {
  const username = currentUser?.username ?? 'hussein'

  // range state
  const [mode, setMode] = useState<RangeMode>('week')
  const [anchor, setAnchor] = useState<Date>(new Date())

  // derived range
  const range = useMemo(() => {
    if (mode === 'day') {
      const start = startOfDay(anchor)
      const end = endOfDay(anchor)
      return { start, end, label: dayLabel(anchor) }
    } else {
      const start = startOfWeekMonday(anchor)
      const end = endOfWeekSunday(anchor)
      return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
    }
  }, [mode, anchor])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState<Visit[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<StatusTab>('all')

  const load = async () => {
    setLoading(true); setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('visits')
        .select('id, visit_date, status, visited_by, client_name')
        .gte('visit_date', toISO(range.start))
        .lte('visit_date', toISO(range.end))
        .eq('visited_by', username)
        .order('visit_date', { ascending: true })

      if (error) throw error

      const normalized: Visit[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        visit_date: String(r.visit_date ?? '').slice(0, 10),
        status: r.status ?? 'planned',
        client_name: r.client_name ?? null,
        visited_by: r.visited_by ?? null,
      }))
      setRows(normalized)
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load achievements.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [username, range.start.getTime(), range.end.getTime()])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // ---- metrics: ALWAYS computed from ALL rows (not filtered by tab) ----
  const metrics = useMemo(() => {
    let planned = 0
    let done = 0
    const dayMap = new Map<string, { planned: number; done: number }>()

    // ensure we show all 7 days in week mode even if empty
    if (mode === 'week') {
      const s = startOfWeekMonday(anchor)
      for (let i = 0; i < 7; i++) {
        const d = new Date(s); d.setDate(s.getDate() + i)
        dayMap.set(toISO(d), { planned: 0, done: 0 })
      }
    }

    for (const v of rows) {
      const d = v.visit_date
      if (!dayMap.has(d)) dayMap.set(d, { planned: 0, done: 0 })
      if (v.status === 'done') {
        dayMap.get(d)!.done += 1
        done += 1
      } else if (v.status === 'planned' || v.status === 'en_route') {
        dayMap.get(d)!.planned += 1
        planned += 1
      }
    }

    const attendanceDays = Array.from(dayMap.values()).filter(x => x.done > 0).length
    const denom = planned + done
    const completionRate = denom > 0 ? done / denom : 0

    const perDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        label: weekDayShort(new Date(date)) + (mode === 'day' ? ` ${date}` : ''),
        planned: v.planned,
        done: v.done,
      }))

    return { plannedTotal: planned, doneTotal: done, attendanceDays, completionRate, perDay }
  }, [rows, mode, anchor])

  // ---- list filtering ONLY affects the visible list, not metrics ----
  const visible = useMemo(() => {
    if (tab === 'all') return rows
    if (tab === 'planned') return rows.filter(v => v.status === 'planned' || v.status === 'en_route')
    if (tab === 'done') return rows.filter(v => v.status === 'done')
    return rows
  }, [rows, tab])

  // ---- nav handlers ----
  const prev = () => {
    if (mode === 'day') {
      const d = new Date(anchor); d.setDate(anchor.getDate() - 1); setAnchor(d)
    } else {
      const d = new Date(anchor); d.setDate(anchor.getDate() - 7); setAnchor(d)
    }
  }
  const next = () => {
    if (mode === 'day') {
      const d = new Date(anchor); d.setDate(anchor.getDate() + 1); setAnchor(d)
    } else {
      const d = new Date(anchor); d.setDate(anchor.getDate() + 7); setAnchor(d)
    }
  }

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Achievements Review</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Range controls */}
      <View style={styles.controls}>
        <View style={styles.modeRow}>
          {(['day','week'] as const).map(m => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modePill, mode === m ? styles.modeOn : styles.modeOff]}
            >
              <Text style={mode === m ? styles.modeTxtOn : styles.modeTxtOff}>{m.toUpperCase()}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Pressable onPress={prev} style={styles.navBtn}><Text style={styles.navTxt}>‹</Text></Pressable>
          <Text style={styles.rangeLabel}>{range.label}</Text>
          <Pressable onPress={next} style={styles.navBtn}><Text style={styles.navTxt}>›</Text></Pressable>
        </View>

        {/* status filter (affects list only) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
          {(['all','planned','done'] as StatusTab[]).map(s => (
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

      {/* Stat Cards (always based on ALL rows in range) */}
      <View style={styles.statsRow}>
        <StatCard
          title="Attendance Days"
          value={String(metrics.attendanceDays)}
          desc="Days with at least one completed visit"
          tone="blue"
        />
        <StatCard
          title="Planned"
          value={String(metrics.plannedTotal)}
          desc="Scheduled or in-progress"
          tone="slate"
        />
        <StatCard
          title="Completed"
          value={String(metrics.doneTotal)}
          desc="Visits finished"
          tone="green"
        />
        <StatCard
          title="Completion"
          value={`${Math.round(metrics.completionRate * 100)}%`}
          desc="Done / (Planned + Done)"
          tone="indigo"
        />
      </View>

      {/* Table + Visit list */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
      >
        {/* per-day aggregated progress (still based on ALL rows) */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, { flex: 1.4 }]}>{mode === 'day' ? 'Date' : 'Day'}</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Planned</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>Done</Text>
            <Text style={[styles.th, { flex: 3 }]}>Progress</Text>
          </View>

          {loading ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : errorMsg ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{errorMsg}</Text>
              <Pressable onPress={load} style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}>
                <Text style={styles.btnPrimaryText}>Retry</Text>
              </Pressable>
            </View>
          ) : metrics.perDay.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: '#6b7280' }}>No visits in this range.</Text>
            </View>
          ) : (
            metrics.perDay.map(row => {
              const total = row.planned + row.done
              const pct = total > 0 ? Math.min(1, row.done / total) : 0
              return (
                <View key={row.date} style={styles.tr}>
                  <Text style={[styles.td, { flex: 1.4 }]}>{mode === 'day' ? row.date : row.label}</Text>
                  <Text style={[styles.td, { flex: 0.8, textAlign: 'center' }]}>{row.planned}</Text>
                  <Text style={[styles.td, { flex: 0.8, textAlign: 'center' }]}>{row.done}</Text>
                  <View style={[styles.td, { flex: 3 }]}>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
                    </View>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* detailed visits (filtered by tab) */}
        {!loading && !errorMsg && visible.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.listTitle}>Visits</Text>
            {groupByDate(visible, mode).map(group => (
              <View key={group.date} style={{ marginTop: 8 }}>
                {mode === 'week' && <Text style={styles.groupHead}>{group.date}</Text>}
                {group.items.map(v => (
                  <View key={v.id} style={styles.visitCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vClient} numberOfLines={1}>{v.client_name || '—'}</Text>
                      <Text style={styles.vMeta} numberOfLines={1}>{v.visit_date}</Text>
                    </View>
                    <StatusChip status={v.status} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

/* ---------- helpers ---------- */
function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function endOfDay(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setHours(23, 59, 59, 999)
  return x
}
function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 0=Mon
  x.setDate(x.getDate() - dow)
  return x
}
function endOfWeekSunday(d: Date) {
  const s = startOfWeekMonday(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  e.setHours(23, 59, 59, 999)
  return e
}
function weekDayShort(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}
function groupByDate(items: Visit[], mode: RangeMode) {
  const map = new Map<string, Visit[]>()
  for (const v of items) {
    const key = mode === 'day' ? 'Selected Day' : `${weekDayShort(new Date(v.visit_date))} • ${v.visit_date}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(v)
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
}

/* ---------- small presentational bits ---------- */
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

function StatCard({ title, value, desc, tone }:{
  title: string; value: string; desc: string; tone: 'blue'|'slate'|'green'|'indigo'
}) {
  const map: any = {
    blue:   { bg: '#eff6ff', fg: '#1d4ed8' },
    slate:  { bg: '#f1f5f9', fg: '#0f172a' },
    green:  { bg: '#ecfdf5', fg: '#065f46' },
    indigo: { bg: '#eef2ff', fg: '#3730a3' },
  }
  const c = map[tone]
  return (
    <View style={[styles.statCard, { backgroundColor: c.bg, borderColor: c.bg }]}>
      <Text style={[styles.statTitle, { color: c.fg }]}>{title}</Text>
      <Text style={[styles.statValue, { color: c.fg }]}>{value}</Text>
      <Text style={styles.statDesc}>{desc}</Text>
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

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modePill: {
    height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center'
  },
  modeOn:  { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  modeOff: { backgroundColor: '#fff',    borderColor: '#e5e7eb' },
  modeTxtOn:  { color: '#fff', fontWeight: '800' },
  modeTxtOff: { color: '#111827', fontWeight: '800' },

  navBtn: { width: 38, height: 34, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  navTxt: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  rangeLabel: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginHorizontal: 8 },

  pill: {
    height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center'
  },
  pillOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillOff:{ backgroundColor: '#fff',    borderColor: '#e5e7eb' },
  pillTxtOn: { color: '#fff',     fontWeight: '800' },
  pillTxtOff:{ color: '#111827',  fontWeight: '800' },

  statsRow: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  statCard: {
    flexGrow: 1, minWidth: 150,
    borderRadius: 16, borderWidth: 1, padding: 14,
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },
  statTitle: { fontSize: 12, fontWeight: '800' },
  statValue: { fontSize: 24, fontWeight: '900', marginTop: 8 },
  statDesc: { fontSize: 12, color: '#475569', marginTop: 4 },

  table: {
    borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#fff',
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
    overflow: 'hidden', marginTop: 10,
  },
  thead: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#edf0f5' },
  th: { fontSize: 12, fontWeight: '800', color: '#475569' },

  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  td: { fontSize: 13, color: '#0f172a' },

  barBg: { height: 10, backgroundColor: '#e5e7eb', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: '#16a34a' },

  listTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a', marginTop: 14 },

  groupHead: { fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 6, marginTop: 4 },

  visitCard: {
    marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#eef0f3',
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10,
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
  },
  vClient: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  vMeta:   { fontSize: 12, color: '#475569', marginTop: 2 },

  btn: {
    height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
})
