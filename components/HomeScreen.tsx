import { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native'

type Item = { key: string; title: string; subtitle?: string; icon: string }
type Props = {
  onSelect?: (key: string) => void
  /** Pass the friendly display name from Login/parent */
  welcomeName?: string
}

export default function HomeScreen({ onSelect, welcomeName }: Props) {
  // search removed from UI, keep state so the rest of the code doesn’t break
  const [q] = useState('')
  const { width } = useWindowDimensions()

  // responsive columns: phones 2, small tablets 3, large 4
  const columns = width >= 1200 ? 4 : width >= 900 ? 3 : 2
  const gap = 12
  const cardW = Math.floor((width - 32 /*screen padding x2*/ - gap * (columns - 1)) / columns)

  const items = useMemo<Item[]>(
    () => [
      { key: 'prospects',         title: 'Prospects List',              subtitle: 'All clients',                              icon: '👥' },
      { key: 'products',          title: 'Products Review',             subtitle: 'All products',                             icon: '📦' },
      { key: 'opportunities',     title: 'Planned Opportunities',       subtitle: 'Visits & schedules,\nAgenda & routing',    icon: '📝' },
      { key: 'summary',           title: 'Summary',                     subtitle: 'Actions over clients',                     icon: '📒' },
      { key: 'end_journey',       title: 'End Journey Report',          subtitle: 'تقرير نهاية الرحلة',                      icon: '🛑' },
      { key: 'daily_collection',  title: 'Daily Collection',            subtitle: 'Payments today',                           icon: '💵' },
      { key: 'assess_objectives', title: 'Assess Prospects Objectives', subtitle: 'Manage tasks',                             icon: '✅' },
      { key: 'achievements',      title: 'Achievements Review',         subtitle: 'Attendance & KPIs',                        icon: '📈' },
      { key: 'brochures',         title: 'Brochures Review',            subtitle: 'Browse docs',                              icon: '📚' },
      // New section with SAME design as others
      { key: 'odometer_review',   title: 'Odometer Review',             subtitle: 'Track distance & routes',                  icon: '🚗' },
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

  const name = (welcomeName || '').trim()
  const greeting = name ? `Welcome, ${name}` : 'Welcome'

  return (
    <View style={styles.screen}>
      {/* top bar (clean & left-aligned) */}
      <View style={styles.appBar}>
        <View style={styles.greetWrap}>
          <Text style={styles.greetEmoji}>👋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.greetSub}>Pick a section to get started</Text>
          </View>
        </View>
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
                { width: cardW, transform: [{ scale: pressed ? 0.98 : 1 }] },
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
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  /* --- sexy, minimal top bar --- */
  appBar: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 8px 22px rgba(0,0,0,0.06)',
  },
  greetWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  greetEmoji: {
    fontSize: 20,
    lineHeight: 20,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  greetSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },

  /* grid + cards (same design for all) */
  grid: { paddingTop: 16, paddingBottom: 8 },
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
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff',
    marginBottom: 12,
  },
  icon: { fontSize: 22 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 12, color: '#6b7280' },
})
