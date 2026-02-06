import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LandingPage from './components/landing/LandingPage';

const PlaygroundPage = lazy(() => import('./components/playground/PlaygroundPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/playground"
        element={
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
                Loading playground...
              </div>
            }
          >
            <PlaygroundPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
