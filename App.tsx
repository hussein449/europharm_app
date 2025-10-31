// App.tsx
import { useState, type ReactNode } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, StyleSheet } from 'react-native'

// Screens
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

  const goHome = () => setScreen('home')

  const ScreenMap: Record<Screen, ReactNode> = {
    home: (
      <HomeScreen
        onSelect={(key) => {
          const map: Record<string, Screen> = {
            prospects: 'prospects',
            products: 'products',
            brochures: 'brochures',
            opportunities: 'visits',
            summary: 'summary',
            assess_objectives: 'objectives',
            achievements: 'achievements',
            end_journey: 'end_report',
            odometer_review: 'odometer_review',
          }
          const next = map[key]
          if (next) setScreen(next)
        }}
        welcomeName={user.username}
      />
    ),

    prospects: <ProspectsList onBack={goHome} />,
    products: <ProductsReview currentUserName={user.username} onBack={goHome} />,
    brochures: <BrochureReview currentRepName={user.username} onBack={goHome} />,
    visits: <VisitsSchedule currentUser={user} onBack={goHome} />,
    summary: <SummaryScreen currentUser={user} onBack={goHome} />,
    objectives: <ObjectivesScreen currentUser={user} onBack={goHome} />,
    achievements: <AchievementsReview currentUser={user} onBack={goHome} />,
    end_report: <EndJourneyReport currentUser={user} onBack={goHome} />,
    odometer_review: <OdometerReview currentUser={user} onBack={goHome} />,
  }

  return (
    <AppContainer>
      <StatusBar style="dark" />
      {ScreenMap[screen]}
    </AppContainer>
  )
}

/* --- Layout Wrapper --- */
function AppContainer({ children }: { children: ReactNode }) {
  return <View style={styles.container}>{children}</View>
}

/* --- Global Styling --- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: 28,
  },
})
