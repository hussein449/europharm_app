// components/ProspectsList.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { EditProspectModal, ViewProspectModal, Prospect } from './ProspectModals'

type Props = {
  onBack?: () => void
}

type FilterMode = 'all' | 'not_visited' | 'not_met'

export default function ProspectsList({ onBack }: Props) {
  const [items, setItems] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [viewId, setViewId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const [filter, setFilter] = useState<FilterMode>('all')

  const load = async () => {
    setLoading(true)
    try {
      // Expecting your RPC to return the columns in Prospect type
      const { data, error } = await supabase.rpc('get_prospects')
      if (error) throw error
      setItems((data ?? []) as Prospect[])
    } catch (e: any) {
      console.error('get_prospects error:', e?.message ?? e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const freqMet = (p: Prospect) =>
    (p?.freq_required ?? 0) === 0
      ? (p?.freq_actual ?? 0) > 0
      : (p?.freq_actual ?? 0) >= (p?.freq_required ?? 0)

  // Buckets we care about
  const notVisited = (p: Prospect) =>
    (p?.freq_required ?? 0) > 0 && (p?.freq_actual ?? 0) === 0

  const notMet = (p: Prospect) =>
    (p?.freq_required ?? 0) > 0 &&
    (p?.freq_actual ?? 0) > 0 &&
    (p?.freq_actual ?? 0) < (p?.freq_required ?? 0)

  const filtered = useMemo(() => {
    if (filter === 'not_visited') return items.filter(notVisited)
    if (filter === 'not_met') return items.filter(notMet)
    return items
  }, [items, filter])

  const counts = useMemo(() => {
    const nv = items.filter(notVisited).length
    const nm = items.filter(notMet).length
    return { nv, nm, all: items.length }
  }, [items])

  return (
    <View style={styles.screen}>
      {/* App bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Prospects</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <Segment
          label={`All (${counts.all})`}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Segment
          label={`Not Visited (${counts.nv})`}
          active={filter === 'not_visited'}
          onPress={() => setFilter('not_visited')}
        />
        <Segment
          label={`Freq Not Met (${counts.nm})`}
          active={filter === 'not_met'}
          onPress={() => setFilter('not_met')}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>✨</Text>
          <Text style={styles.emptyTitle}>
            {filter === 'not_visited'
              ? 'No clients left unvisited this month'
              : filter === 'not_met'
              ? 'All frequencies met — nice'
              : 'No prospects to show'}
          </Text>
          <Text style={styles.emptySub}>
            Pull to refresh or switch filters to explore other groups.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filtered.map((p) => {
            const met = freqMet(p)
            const isNotVisited = notVisited(p)
            const isNotMet = notMet(p)

            // subtle accent on left edge based on bucket
            const accentStyle = isNotVisited
              ? styles.accentRed
              : isNotMet
              ? styles.accentAmber
              : styles.accentNeutral

            return (
              <View key={p.id} style={[styles.card, accentStyle]}>
                <View style={styles.rowTop}>
                  <View style={styles.avatar}>
                    <Text style={{ fontSize: 22 }}>🧑🏻‍⚕️</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Code </Text>
                      <Text style={styles.metaValuePrimary}>{p.code}</Text>
                      <Text style={styles.dot}>•</Text>
                      <Text style={styles.metaLabel}>Spec </Text>
                      <Text style={styles.metaValue}>{p.specialty}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Frequency </Text>
                      <Text style={styles.metaValue}>
                        {p.freq_actual}/{p.freq_required}
                      </Text>
                      <View style={[styles.chip, met ? styles.chipOk : styles.chipBad]}>
                        <Text style={met ? styles.chipOkTxt : styles.chipBadTxt}>
                          {met ? 'Met' : isNotVisited ? 'Not visited' : 'Not met'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => setViewId(p.id)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.actionInfo,
                      { transform: [{ scale: pressed ? 0.98 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.actionText, styles.actionInfoTxt]}>Check Info</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setEditId(p.id)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.actionEdit,
                      { transform: [{ scale: pressed ? 0.98 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.actionText, styles.actionEditTxt]}>Edit Info</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Modals */}
      <ViewProspectModal open={!!viewId} id={viewId} onClose={() => setViewId(null)} />
      <EditProspectModal
        open={!!editId}
        id={editId}
        onClose={() => setEditId(null)}
        onSaved={() => load()}
      />
    </View>
  )
}

/* --- Small components --- */
function Segment({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, active ? styles.segmentOn : styles.segmentOff]}>
      <Text style={active ? styles.segmentTxtOn : styles.segmentTxtOff}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  appBar: {
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },

  /* Filter bar */
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  segmentOff: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  segmentTxtOn: { color: '#fff', fontWeight: '800', fontSize: 12 },
  segmentTxtOff: { color: '#0f172a', fontWeight: '800', fontSize: 12 },

  list: { paddingHorizontal: 16, paddingVertical: 8 },

  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf0f5',
    padding: 16,
    marginBottom: 12,
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
    position: 'relative',
  },
  // subtle 4px accent on the left
  accentNeutral: { borderLeftWidth: 4, borderLeftColor: '#e5e7eb' },
  accentRed: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  accentAmber: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },

  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e5f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  metaValue: { color: '#374151', fontSize: 12, fontWeight: '700' },
  metaValuePrimary: { color: '#2563eb', fontSize: 12, fontWeight: '800' },
  dot: { marginHorizontal: 4, color: '#94a3b8', fontSize: 12, fontWeight: '900' },

  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginLeft: 6 },
  chipOk: { backgroundColor: '#dcfce7' },
  chipOkTxt: { color: '#065f46', fontWeight: '800', fontSize: 11 },
  chipBad: { backgroundColor: '#fee2e2' },
  chipBadTxt: { color: '#991b1b', fontWeight: '800', fontSize: 11 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionText: { fontWeight: '800', fontSize: 13 },

  actionInfo: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  actionInfoTxt: { color: '#3730a3' },

  actionEdit: { backgroundColor: '#ecfeff', borderColor: '#a5f3fc' },
  actionEditTxt: { color: '#0e7490' },

  /* Empty state */
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 42, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a', textAlign: 'center' },
  emptySub: { marginTop: 6, fontSize: 12, color: '#64748b', textAlign: 'center' },
})
