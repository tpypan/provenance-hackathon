import { Routes, Route, Navigate } from 'react-router-dom'

import LookupPage from './pages/LookupPage.jsx'
import ProductPage from './pages/ProductPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/lookup" replace />} />
          <Route path="/lookup" element={<LookupPage />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}
