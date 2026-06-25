import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import PlaygroundPage from './components/playground/PlaygroundPage';

export default function App() {
  return (
    <>
      <PlaygroundPage />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
