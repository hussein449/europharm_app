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
import EndJourneyReport from './components/EndJourneyReport'
import OdometerReview from './components/OdometerReview'
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
  | 'end_report'
  | 'odometer_review'

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [screen, setScreen] = useState<Screen>('home')

  if (!user) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen onSuccess={(u: AppUser) => setUser(u)} />
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
            if (key === 'opportunities') setScreen('visits')
            if (key === 'summary') setScreen('summary')
            if (key === 'assess_objectives') setScreen('objectives')
            if (key === 'achievements') setScreen('achievements')
            if (key === 'end_journey') setScreen('end_report')
            if (key === 'odometer_review') setScreen('odometer_review')
          }}
          welcomeName={user.username}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen currentUser={user} onBack={() => setScreen('home')} />
      )}

      {screen === 'objectives' && (
        <ObjectivesScreen currentUser={user} onBack={() => setScreen('home')} />
      )}

      {screen === 'achievements' && (
        <AchievementsReview currentUser={user} onBack={() => setScreen('home')} />
      )}

      {screen === 'prospects' && (
        <ProspectsList onBack={() => setScreen('home')} />
      )}

      {screen === 'products' && (
        // ✅ pass the username so ProductsReview can filter movements immediately
        <ProductsReview
          onBack={() => setScreen('home')}
          currentUserName={user.username}
        />
      )}

      {screen === 'brochures' && (
        <BrochureReview onBack={() => setScreen('home')} currentRepName={user.username} />
      )}

      {screen === 'visits' && (
        <VisitsSchedule currentUser={user} onBack={() => setScreen('home')} />
      )}

      {screen === 'end_report' && (
        <EndJourneyReport currentUser={user} onBack={() => setScreen('home')} />
      )}
      {screen === 'odometer_review' && (
        <OdometerReview currentUser={user} onBack={() => setScreen('home')} />
      )}
    </>
  )
}
