import { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import HomeScreen from './components/HomeScreen'
import LoginScreen from './login'
import ProspectsList from './components/ProspectsList'

export type AppUser = { id: string; username: string }
type Screen = 'home' | 'prospects'

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [screen, setScreen] = useState<Screen>('home')

  if (!user) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen onSuccess={(u) => setUser(u)} />
      </>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      {screen === 'home' ? (
        <HomeScreen
          onSelect={(key) => {
            if (key === 'prospects') setScreen('prospects')
            // add more keys later
          }}
        />
      ) : (
        <ProspectsList
          onBack={() => setScreen('home')}
          onView={(p) => alert(`View info for ${p.name} (${p.code})`)}
          onEdit={(p) => alert(`Edit info for ${p.name} (${p.code})`)}
        />
      )}
    </>
  )
}
