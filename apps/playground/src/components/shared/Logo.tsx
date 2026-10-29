export default function Logo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="62 68 900 900" className={className}>
      <polygon fill="#4ACECC" points="512,78 132,292 512,270" />
      <polygon fill="#4ACECC" points="512,78 512,270 892,292" />
      <polygon fill="#03B0AD" points="132,292 512,270 323,622" />
      <polygon fill="#4ACECC" points="512,270 323,622 701,622" />
      <polygon fill="#03B0AD" points="512,270 892,292 701,622" />
      <polygon fill="#0C8698" points="132,292 323,622 132,734" />
      <polygon fill="#07606F" points="892,292 892,734 701,622" />
      <polygon fill="#07606F" points="132,734 323,622 512,958" />
      <polygon fill="#03B0AD" points="323,622 701,622 512,958" />
      <polygon fill="#07606F" points="701,622 892,734 512,958" />
      <path
        d="M512,78L132,292M512,78L892,292M512,78L512,270M512,270L132,292M512,270L892,292M512,270L323,622M512,270L701,622M132,292L323,622M892,292L701,622M323,622L701,622M132,292L132,734M892,292L892,734M132,734L323,622M892,734L701,622M323,622L512,958M701,622L512,958M132,734L512,958M892,734L512,958"
        fill="none"
        stroke="white"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
