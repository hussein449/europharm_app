import { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native'

type Item = { key: string; title: string; subtitle?: string; icon: string }
type Props = { onSelect?: (key: string) => void }

export default function HomeScreen({ onSelect }: Props) {
  const [q, setQ] = useState('')
  const { width } = useWindowDimensions()

  // responsive columns: phones 2, small tablets 3, large 4
  const columns = width >= 1200 ? 4 : width >= 900 ? 3 : 2
  const gap = 12
  const cardW = Math.floor((width - 32 /*screen padding x2*/ - gap * (columns - 1)) / columns)

  const items = useMemo<Item[]>(
    () => [
      { key: 'prospects',       title: 'Prospects List',              subtitle: 'All clients',                            icon: '👥' },
      { key: 'products',        title: 'Products Review',             subtitle: 'All products',                           icon: '📦' },
      { key: 'cycle',           title: 'Cycle Planning',              subtitle: 'Agenda & routing',                       icon: '🗓️' },
      { key: 'opportunities',   title: 'Planned Opportunities',       subtitle: 'Visits & schedules',                     icon: '📝' },
      { key: 'summary',         title: 'Summary',                     subtitle: 'Actions over clients',                   icon: '📒' },
      { key: 'end_journey',     title: 'End Journey Report',          subtitle: 'تقرير نهاية الرحلة',                    icon: '🛑' },
      { key: 'daily_collection',title: 'Daily Collection',            subtitle: 'Payments today',                          icon: '💵' },
      { key: 'assess_objectives',title:'Assess Prospects Objectives', subtitle: 'Manage tasks',                            icon: '✅' },
      { key: 'visits_history',  title: 'Visits History',              subtitle: 'Past 4 weeks',                            icon: '📊' },
      { key: 'achievements',    title: 'Achievements Review',         subtitle: 'Attendance & KPIs',                      icon: '📈' },
      { key: 'view_stock',      title: 'View Stock',                  subtitle: 'Availability & status',                  icon: '🏷️' },
      { key: 'items_request',   title: 'Items / Samples Request',     subtitle: 'Request more',                            icon: '📦' },
      { key: 'return_stock',    title: 'Return Stock',                subtitle: 'Process returns',                         icon: '📤' },
      { key: 'brochures',       title: 'Brochures Review',            subtitle: 'Browse docs',                             icon: '📚' },
      { key: 'odometer',        title: 'Journey Odometer',            subtitle: 'Distance & logs',                         icon: '🧭' },
      { key: 'not_visited',     title: 'Not Visited / Freq Not Met',  subtitle: 'Past month gaps',                        icon: '🚫' },
      { key: 'data_mgmt',       title: 'Data Management',             subtitle: 'Backup & recovery',                      icon: '💽' },
    ],
    []
  )

  const filtered = q
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q.toLowerCase()) ||
          i.subtitle?.toLowerCase().includes(q.toLowerCase())
      )
    : items

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>Home</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search options…"
          placeholderTextColor="#9aa0a6"
          style={styles.search}
          clearButtonMode="while-editing"
        />
      </View>

      {/* grid */}
      <ScrollView contentContainerStyle={[styles.grid, { gap, paddingHorizontal: 16 }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {filtered.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => onSelect?.(it.key)}
              style={({ pressed }) => [
                styles.card,
                {
                  width: cardW,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{it.icon}</Text>
              </View>

              <Text numberOfLines={2} style={styles.title}>
                {it.title}
              </Text>

              {it.subtitle ? (
                <Text numberOfLines={2} style={styles.subtitle}>
                  {it.subtitle}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },

  // Top app bar with a soft gradient vibe (rn-web friendly via boxShadow)
  appBar: {
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  search: {
    height: 42,
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    color: '#111827',
  },

  grid: {
    paddingTop: 16,
    paddingBottom: 8,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf0f5',
    padding: 14,
    justifyContent: 'space-between',
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    marginBottom: 12,
  },
  icon: { fontSize: 22 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
})
