// components/ProspectsList.tsx
import { useEffect, useState } from 'react'
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

export default function ProspectsList({ onBack }: Props) {
  const [items, setItems] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [viewId, setViewId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_prospects')
      if (error) throw error
      setItems(data as Prospect[])
    } catch (e: any) {
      console.error(e)
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

  return (
    <View style={styles.screen}>
      {/* App bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Prospects List</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {items.map((p) => (
            <View key={p.id} style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 22 }}>🧑🏻‍⚕️</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Code: </Text>
                    <Text style={styles.metaValuePrimary}>{p.code}</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Specialty: </Text>
                    <Text style={styles.metaValue}>{p.specialty}</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Frequency: </Text>
                    <Text style={styles.metaValue}>
                      {p.freq_actual}/{p.freq_required}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => setViewId(p.id)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: '#eef2ff', transform: [{ scale: pressed ? 0.98 : 1 }] },
                  ]}
                >
                  <Text style={[styles.actionText, { color: '#3730a3' }]}>Check Info</Text>
                </Pressable>

                <Pressable
                  onPress={() => setEditId(p.id)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: '#ecfeff', transform: [{ scale: pressed ? 0.98 : 1 }] },
                  ]}
                >
                  <Text style={[styles.actionText, { color: '#0e7490' }]}>Edit Info</Text>
                </Pressable>
              </View>
            </View>
          ))}

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

  list: { paddingHorizontal: 16, paddingVertical: 8 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf0f5',
    padding: 16,
    marginBottom: 12,
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },

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

  metaRow: { flexDirection: 'row', flexWrap: 'wrap' },
  metaLabel: { color: '#6b7280', fontSize: 12 },
  metaValue: { color: '#374151', fontSize: 12, fontWeight: '600' },
  metaValuePrimary: { color: '#2563eb', fontSize: 12, fontWeight: '700' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionText: { fontWeight: '800', fontSize: 13 },
})
