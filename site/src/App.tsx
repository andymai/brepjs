import { Analytics } from '@vercel/analytics/react';
import PlaygroundPage from './components/playground/PlaygroundPage';

export default function App() {
  return (
    <>
      <PlaygroundPage />
      <Analytics />
    </>
  );
}
