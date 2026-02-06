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
      <footer className="border-t border-border-subtle py-8 text-center text-sm text-gray-600">
        brepjs is open source under the Apache-2.0 license
      </footer>
    </div>
  );
}
