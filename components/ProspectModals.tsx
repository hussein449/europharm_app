// components/ProspectModals.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

export type Prospect = {
  id: string
  name: string
  code: string
  specialty: string
  freq_actual: number
  freq_required: number
  phone?: string | null
  mobile?: string | null
  classification?: string | null
  area?: string | null
  address?: string | null
  email?: string | null
  note?: string | null
  status?: string | null
}

/* ===== optional login cache helpers (still used by Edit modal for updated_by) ===== */
async function getCachedUser(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem('user')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}
function pickUsername(u: any | null): string | null {
  if (!u) return null
  return u.username || u.name || u.email || null
}
export async function getCurrentUsernameFromCache(): Promise<string | null> {
  const u = await getCachedUser()
  return pickUsername(u)
}

/* =======================
   Add Prospect Modal
   (rep name is typed by user and saved to created_by)
======================= */
export function AddProspectModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [area, setArea] = useState('')
  const [freqRequired, setFreqRequired] = useState<string>('1')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [repName, setRepName] = useState('') // <-- manual input that will be saved to created_by

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    // reset fields each time modal opens
    setName('')
    setCode('')
    setSpecialty('')
    setArea('')
    setFreqRequired('1')
    setPhone('')
    setEmail('')
    setRepName('')
  }, [open])

  const save = async () => {
    const cleanName = name.trim()
    const cleanRep = repName.trim()
    const freq = Number((freqRequired ?? '0').replace(/[^\d]/g, ''))

    if (!cleanRep) {
      Alert.alert('Missing info', 'Rep Name is required.')
      return
    }
    if (!cleanName) {
      Alert.alert('Missing info', 'Prospect Name is required.')
      return
    }
    if (!Number.isFinite(freq) || freq < 0) {
      Alert.alert('Invalid frequency', 'Required frequency must be a whole number ≥ 0.')
      return
    }

    try {
      setSaving(true)

      // IMPORTANT: `created_by` must be a TEXT/VARCHAR column for this to work.
      const row: any = {
        name: cleanName,
        code: code.trim() || null,
        specialty: specialty.trim() || null,
        area: area.trim() || null,
        freq_required: freq,
        phone: phone.trim() || null,
        email: email.trim() || null,
        created_by: cleanRep, // <-- save the typed rep name here
      }

      const { data, error } = await supabase
        .from('prospects')
        .insert([row])
        .select()
        .single()

      if (error) throw error
      if (!data) throw new Error('Insert returned no row.')

      Alert.alert('Saved', 'New prospect added.')
      onSaved()
    } catch (e: any) {
      console.error('insert prospects error:', e)
      Alert.alert('Save failed', e?.message ?? 'Could not add prospect.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { width: 560, maxWidth: '95%' }]}>
          <Text style={styles.sheetTitle}>Add Prospect</Text>
          <ScrollView style={{ maxHeight: 520 }}>
            {/* Rep name the user types (this is saved to created_by) */}
            <Field label="Rep Name*" value={repName} onChangeText={setRepName} />

            {/* Prospect fields */}
            <Field label="Prospect Name*" value={name} onChangeText={setName} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Code" value={code} onChangeText={setCode} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Specialty" value={specialty} onChangeText={setSpecialty} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Area" value={area} onChangeText={setArea} />
              </View>
              <View style={{ width: 140 }}>
                <Field
                  label="Required Freq"
                  value={freqRequired}
                  onChangeText={(v) => setFreqRequired(v.replace(/[^\d]/g, ''))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
              </View>
            </View>
            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[styles.btn, styles.btnPrimary, saving ? { opacity: 0.7 } : null]}
              accessibilityRole="button"
            >
              {saving ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

/* =======================
   View Prospect Modal
======================= */
export function ViewProspectModal({
  open,
  id,
  onClose,
}: {
  open: boolean
  id: string | null
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [p, setP] = useState<Prospect | null>(null)

  const visitsThisMonth = p?.freq_actual ?? 0
  const visitedThisMonth = visitsThisMonth > 0
  const freqRequired = p?.freq_required ?? 0
  const freqMet = useMemo(
    () => (freqRequired ? visitsThisMonth >= freqRequired : visitedThisMonth),
    [visitsThisMonth, freqRequired, visitedThisMonth]
  )

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!open || !id) return
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('v_prospects_with_freq_current_month')
          .select(
            'id, name, code, specialty, freq_actual, freq_required, phone, mobile, classification, area, address, email, note, status'
          )
          .eq('id', id)
          .maybeSingle()

        if (error) throw error
        if (!mounted) return
        if (!data) throw new Error('Prospect not found in view.')
        setP(data as Prospect)
      } catch (e: any) {
        Alert.alert('Load failed', e.message ?? 'Unknown error')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => { mounted = false }
  }, [open, id])

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Client Info</Text>
          {loading ? (
            <ActivityIndicator />
          ) : p ? (
            <ScrollView style={{ maxHeight: 520 }}>
              <InfoRow label="Name" value={p.name} strong />
              <InfoRow label="Code" value={p.code} primary />
              <InfoRow label="Status" value={p.status ?? 'Active'} />
              <InfoRow label="Specialty" value={p.specialty} strong />
              <InfoRow label="Area" value={p.area ?? '-'} />
              <InfoRow label="Classification" value={p.classification ?? '-'} />
              <InfoRow label="Frequency (Required)" value={`${p.freq_required ?? 0}`} />
              <InfoRow label="Visits (This Month)" value={`${visitsThisMonth}`} />
              <InfoRow label="Visited This Month" value={visitedThisMonth ? 'Yes' : 'No'} />
              <InfoRow label="Frequency Status" value={freqMet ? 'Met ✅' : 'Not met ❌'} primary={freqMet} />
              <InfoRow label="Phone" value={p.phone ?? '-'} />
              <InfoRow label="Mobile" value={p.mobile ?? '-'} />
              <InfoRow label="Address" value={p.address ?? '-'} />
              <InfoRow label="Email" value={p.email ?? '-'} />
              <InfoRow label="Note" value={p.note ?? '-'} />
              <View style={{ height: 8 }} />
            </ScrollView>
          ) : (
            <Text style={{ color: '#6b7280' }}>No data.</Text>
          )}

          <Pressable onPress={onClose} style={[styles.btn, styles.btnPrimary]}>
            <Text style={styles.btnPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/* =======================
   Edit Prospect Modal
======================= */
export function EditProspectModal({
  open,
  id,
  onClose,
  onSaved,
}: {
  open: boolean
  id: string | null
  onClose: () => void
  onSaved: (updated: { id: string }) => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [mobile, setMobile] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [classification, setClassification] = useState('')
  const [area, setArea] = useState('')
  const [freqReq, setFreqReq] = useState<number | ''>('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('Active')

  // still stamps updated_by from cache if available (safe to keep)
  const currentUsernameRef = useRef<string | null>(null)
  useEffect(() => {
    ;(async () => {
      const u = await getCachedUser()
      currentUsernameRef.current = pickUsername(u)
    })()
  }, [])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!open || !id) return
      setLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_prospect', { p_id: id })
        if (error) throw error
        const p = data as Prospect
        if (!mounted) return
        setName(p.name ?? '')
        setPhone(p.phone ?? '')
        setMobile(p.mobile ?? '')
        setSpecialty(p.specialty ?? '')
        setClassification(p.classification ?? '')
        setArea(p.area ?? '')
        setFreqReq(p.freq_required ?? 0)
        setAddress(p.address ?? '')
        setEmail(p.email ?? '')
        setNote(p.note ?? '')
        setStatus(p.status ?? 'Active')
      } catch (e: any) {
        Alert.alert('Load failed', e.message ?? 'Unknown error')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => { mounted = false }
  }, [open, id])

  const save = async () => {
    if (!id) return
    setSaving(true)
    try {
      const payload = {
        p_id: id,
        p_name: name?.trim() || null,
        p_phone: phone?.trim() || null,
        p_mobile: mobile?.trim() || null,
        p_specialty: specialty?.trim() || null,
        p_classification: classification?.trim() || null,
        p_area: area?.trim() || null,
        p_freq_required:
          typeof freqReq === 'number' && Number.isFinite(freqReq) ? freqReq : null,
        p_address: address?.trim() || null,
        p_email: email?.trim() || null,
        p_note: note?.trim() || null,
        p_status: status?.trim() || null,
      }

      const { data, error } = await supabase.rpc('update_prospect', payload)
      if (error) {
        // @ts-ignore
        console.error('update_prospect error:', error, error.details, error.hint, error.code)
        throw error
      }

      const username = currentUsernameRef.current
      if (username) {
        try {
          await supabase.from('prospects').update({ updated_by: username } as any).eq('id', id)
        } catch {
          // ignore if column doesn't exist / blocked by RLS
        }
      }

      onSaved({ id: (data as any)[0].id })
      onClose()
      Alert.alert('Saved', 'Client updated successfully.')
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { width: 720, maxWidth: '95%' }]}>
          <Text style={styles.sheetTitle}>Edit Client Info</Text>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <ScrollView style={{ maxHeight: 520 }}>
              <Field label="Client Name" value={name} onChangeText={setName} />
              <Field label="Client Phone" value={phone} onChangeText={setPhone} />
              <Field label="Client Mobile" value={mobile} onChangeText={setMobile} />
              <Field label="Specialty" value={specialty} onChangeText={setSpecialty} />
              <Field label="Classification" value={classification} onChangeText={setClassification} />
              <Field label="Client Areas" value={area} onChangeText={setArea} />
              <Field
                label="Frequency (Required)"
                keyboardType="numeric"
                value={String(freqReq)}
                onChangeText={(v) => setFreqReq(v === '' ? '' : Number(v))}
              />
              <Field label="Client Address" value={address} onChangeText={setAddress} />
              <Field label="Client Email" value={email} onChangeText={setEmail} />
              <Field label="Note" value={note} onChangeText={setNote} multiline />
              <Field label="Status" value={status} onChangeText={setStatus} />
              <View style={{ height: 8 }} />
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.btn, styles.btnPrimary]}>
              {saving ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

/* ---- presentational bits ---- */
function InfoRow({
  label,
  value,
  strong,
  primary,
}: {
  label: string
  value: string | number
  strong?: boolean
  primary?: boolean
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#6b7280', fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: primary ? '#16a34a' : '#111827',
          fontSize: strong ? 18 : 14,
          fontWeight: strong ? '800' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  )
}
function InfoHint({ value }: { value: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: '#64748b', fontSize: 11 }}>{value}</Text>
    </View>
  )
}
function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  label: string
  value: string
  onChangeText: (s: string) => void
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad'
  multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: '#6b7280', marginBottom: 6, fontSize: 12 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor="#9aa0a6"
        placeholder=""
        multiline={multiline}
        style={{
          backgroundColor: '#f3f4f6',
          color: '#111827',
          borderWidth: 1,
          borderColor: '#e5e7eb',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 12,
          minHeight: multiline ? 72 : undefined,
        }}
      />
    </View>
  )
}

/* ---- shared styles ---- */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: 560,
    maxWidth: '95%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef0f3',
    padding: 18,
    // @ts-ignore rn-web
    boxShadow: '0 16px 40px rgba(2,8,23,0.2)',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  btnText: { color: '#111827', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },
})
