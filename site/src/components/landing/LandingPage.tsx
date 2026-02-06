import Header from '../layout/Header';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import ExamplesPreview from './ExamplesPreview';
import InstallSection from './InstallSection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <ExamplesPreview />
      <InstallSection />
      <footer className="border-t border-border-subtle py-8 text-center text-sm text-gray-500">
        Apache-2.0 ·{' '}
        <a
          href="https://github.com/andymai/brepjs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 transition-colors hover:text-white"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
