import Header from '../layout/Header';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import ExamplesGallery from './ExamplesGallery';
import InstallSection from './InstallSection';
import CTASection from './CTASection';
import Logo from '../shared/Logo';

function GradientDivider() {
  return <div className="gradient-divider" />;
}

const footerLinks = {
  Docs: [
    { label: 'API Reference', href: 'https://andymai.github.io/brepjs/', target: '_blank' },
    { label: 'Install', href: '/#get-started' },
  ],
  Community: [
    { label: 'GitHub', href: 'https://github.com/andymai/brepjs' },
    { label: 'Discussions', href: 'https://github.com/andymai/brepjs/discussions' },
    { label: 'npm', href: 'https://www.npmjs.com/package/brepjs' },
  ],
  Resources: [
    { label: 'Playground', href: '/playground' },
    { label: 'Changelog', href: 'https://github.com/andymai/brepjs/releases' },
    { label: 'OpenCascade', href: 'https://dev.opencascade.org/' },
  ],
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-gray-950">
      {/* Full-page dot matrix */}
      <div className="dot-matrix" />

      <div className="relative z-10">
        {/* Skip to content (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-gray-950"
        >
          Skip to content
        </a>

        <Header />
        <main id="main">
          <HeroSection />
          <GradientDivider />
          <FeaturesSection />
          <ExamplesGallery />
          <GradientDivider />
          <InstallSection />
          <GradientDivider />
          <CTASection />
        </main>

        {/* Expanded footer */}
        <footer className="border-t border-border-subtle">
          <div className="mx-auto max-w-7xl px-6 py-12">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {/* Branding column */}
              <div className="sm:col-span-2 lg:col-span-1">
                <div className="mb-3 flex items-center gap-2">
                  <Logo className="h-7 w-7" />
                  <span className="text-lg font-bold text-white">brepjs</span>
                </div>
                <p className="max-w-xs text-sm leading-relaxed text-gray-500">
                  Parametric CAD in TypeScript. Exact B-rep geometry powered by OpenCascade, running
                  entirely in the browser.
                </p>
              </div>

              {/* Link columns */}
              {Object.entries(footerLinks).map(([heading, links]) => (
                <div key={heading}>
                  <h4 className="mb-3 text-sm font-semibold text-gray-300">{heading}</h4>
                  <ul className="space-y-2">
                    {links.map((link) => {
                      const isExternal = link.href.startsWith('http');
                      return (
                        <li key={link.label}>
                          <a
                            href={link.href}
                            {...(isExternal
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : {})}
                            className="text-sm text-gray-400 transition-colors hover:text-teal-primary"
                          >
                            {link.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {/* Bottom bar */}
            <div className="mt-10 border-t border-border-subtle pt-6 text-center text-xs text-gray-500">
              Apache-2.0 License
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
