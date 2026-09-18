import { useEffect, useRef, useState } from 'react';

export function Reveal({ children, index = 0 }) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    setRevealed(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transition: 'all 650ms cubic-bezier(0.2, 0.8, 0.3, 1)',
        transitionDelay: `${(index % 4) * 90}ms`,
        transform: revealed ? 'translateY(0)' : 'translateY(26px)',
        opacity: revealed ? 1 : 0
      }}
    >
      {children}
    </div>
  );
}