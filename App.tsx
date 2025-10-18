// App.tsx
import { useState } from 'react'
import { StatusBar } from 'expo-status-bar'

import HomeScreen from './components/HomeScreen'
import LoginScreen from './login'
import ProspectsList from './components/ProspectsList'
import ProductsReview from './components/ProductsReview'
import BrochureReview from './components/BrochureReview'
import VisitsSchedule from './components/VisitsSchedule'
import SummaryScreen from './components/SummaryScreen'
import ObjectivesScreen from './components/ObjectivesScreen'
import AchievementsReview from './components/AchievementsReview'
import EndJourneyReport from './components/EndJourneyReport' // <-- NEW

export type AppUser = { id: string; username: string }

type Screen =
  | 'home'
  | 'prospects'
  | 'products'
  | 'brochures'
  | 'visits'
  | 'summary'
  | 'objectives'
  | 'achievements'
  | 'end_report' // <-- NEW

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

      {screen === 'home' && (
        <HomeScreen
          onSelect={(key) => {
            if (key === 'prospects') setScreen('prospects')
            if (key === 'products') setScreen('products')
            if (key === 'brochures') setScreen('brochures')
            if (key === 'opportunities') setScreen('visits')   // Planned Opportunities → Visits
            if (key === 'summary') setScreen('summary')
            if (key === 'assess_objectives') setScreen('objectives')
            if (key === 'achievements') setScreen('achievements')
            if (key === 'end_journey') setScreen('end_report') // <-- map your tile key
          }}
          welcomeName={user?.username}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen
          currentUser={user}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'objectives' && (
        <ObjectivesScreen
          currentUser={user}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'achievements' && (
        <AchievementsReview
          currentUser={user}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'prospects' && (
        <ProspectsList onBack={() => setScreen('home')} />
      )}

      {screen === 'products' && (
        <ProductsReview onBack={() => setScreen('home')} />
      )}

      {screen === 'brochures' && (
        <BrochureReview onBack={() => setScreen('home')} currentRepName={user.username} />
      )}

      {screen === 'visits' && (
        <VisitsSchedule
          currentUser={user}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'end_report' && (
        <EndJourneyReport
          currentUser={user}          // <-- ✅ pass the logged-in user here
          onBack={() => setScreen('home')}
        />
      )}
    </>
  )
}
