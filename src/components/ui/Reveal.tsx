import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  id?: string;
  className?: string;
  /** Milliseconds to wait after the element enters view. */
  delay?: number;
  /** Fraction of the element that must be visible before animating. */
  threshold?: number;
  /** Animate children one after another instead of the container as a whole. */
  stagger?: boolean;
  style?: CSSProperties;
}

/**
 * Reveals content as it scrolls into view.
 *
 * The hidden state lives in CSS (`.reveal`), and `prefers-reduced-motion` forces those elements
 * visible, so content can never be stranded invisible if the observer never fires. A safety
 * timer covers the remaining case of an observer that silently never calls back.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  id,
  className = '',
  delay = 0,
  threshold = 0.12,
  stagger = false,
  style,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setVisible(true);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.disconnect();
          }
        }
      },
      // Start slightly before the element is fully on screen so it never feels late.
      { threshold, rootMargin: '0px 0px -6% 0px' }
    );
    observer.observe(el);

    // Insurance: never leave content stuck at opacity 0.
    const safety = window.setTimeout(show, 4000);

    return () => {
      observer.disconnect();
      window.clearTimeout(safety);
    };
  }, [threshold]);

  const classes = ['reveal', stagger ? 'stagger' : '', visible ? 'is-visible' : '', className]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties | undefined =
    delay > 0 ? ({ ...style, '--reveal-delay': `${delay}ms` } as CSSProperties) : style;

  return (
    <Tag ref={ref as never} id={id} className={classes} style={mergedStyle}>
      {children}
    </Tag>
  );
}

export default Reveal;
