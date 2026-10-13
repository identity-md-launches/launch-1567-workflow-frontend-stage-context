import { Claim } from './components/Claim'
import { Footer } from './components/Footer'
import { Fund } from './components/Fund'
import { Header } from './components/Header'
import { Overview } from './components/Overview'
import { Owner } from './components/Owner'
import { Shop } from './components/Shop'
import { Trade } from './components/Trade'

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <div className="stars" aria-hidden="true" />
      <Header />
      <main id="main" className="relative z-10">
        <Overview />
        <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-6">
          <Owner />
          <Claim />
          <Shop />
          <Trade />
          <Fund />
        </div>
      </main>
      <Footer />
    </>
  )
}
